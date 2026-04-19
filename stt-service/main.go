// ai-medincident-stt — Speech-to-Text сервис на базе whisper.cpp.
// Принимает multipart audio, конвертирует через ffmpeg и транскрибирует
// через whisper-cli. Выделен из backend, чтобы CPU-bound нагрузка не
// влияла на другие HTTP-эндпоинты (категории, health и т.п.).
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/adaptor/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/sync/semaphore"
)

const (
	whisperTimeout = 60 * time.Second
	ffmpegTimeout  = 15 * time.Second
)

type sttConfig struct {
	whisperBin    string
	modelPath     string
	modelURL      string
	maxBytes      int64
	maxAudioSecs  int
	sem           *semaphore.Weighted
	transcribeDur *prometheus.HistogramVec
	transcribeCnt *prometheus.CounterVec
	modelReady    bool
}

func newSTTConfig(reg *prometheus.Registry) *sttConfig {
	cfg := &sttConfig{
		whisperBin:   getenv("WHISPER_BIN", "/usr/local/bin/whisper-cli"),
		modelPath:    getenv("WHISPER_MODEL_PATH", "/models/ggml-small.bin"),
		modelURL:     getenv("WHISPER_MODEL_URL", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"),
		maxBytes:     getenvInt64("STT_MAX_BYTES", 10*1024*1024),
		maxAudioSecs: getenvInt("STT_MAX_AUDIO_SECONDS", 60),
	}
	parallel := getenvInt("STT_PARALLEL", runtime.NumCPU())
	if parallel < 1 {
		parallel = 1
	}
	cfg.sem = semaphore.NewWeighted(int64(parallel))

	cfg.transcribeDur = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "stt_transcribe_duration_seconds",
		Help:    "Wall-clock time spent transcribing one audio clip (ffmpeg + whisper).",
		Buckets: []float64{0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55},
	}, []string{"outcome"})

	cfg.transcribeCnt = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "stt_transcribe_total",
		Help: "Total number of transcribe requests by outcome.",
	}, []string{"outcome"})

	reg.MustRegister(cfg.transcribeDur, cfg.transcribeCnt)
	return cfg
}

// ensureModel — скачивает модель whisper, если её нет на диске.
func ensureModel(ctx context.Context, path, url string) error {
	if fi, err := os.Stat(path); err == nil && fi.Size() > 1024*1024 {
		slog.Info("whisper model present", "path", path, "size_mb", fi.Size()/(1024*1024))
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir model dir: %w", err)
	}
	slog.Info("downloading whisper model", "url", url, "path", path)
	start := time.Now()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download: unexpected status %d", resp.StatusCode)
	}

	tmp := path + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return fmt.Errorf("create tmp: %w", err)
	}
	n, err := io.Copy(f, resp.Body)
	if cerr := f.Close(); cerr != nil && err == nil {
		err = cerr
	}
	if err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("write model: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("rename model: %w", err)
	}
	slog.Info("whisper model downloaded", "bytes", n, "elapsed", time.Since(start).String())
	return nil
}

// transcribe — конвертирует произвольное аудио в 16kHz mono WAV через ffmpeg и
// прогоняет через whisper-cli, возвращая распознанный текст.
func (s *sttConfig) transcribe(ctx context.Context, audio []byte) (string, error) {
	tmpDir, err := os.MkdirTemp("", "stt-*")
	if err != nil {
		return "", fmt.Errorf("mkdtemp: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	inPath := filepath.Join(tmpDir, "in")
	wavPath := filepath.Join(tmpDir, "audio.wav")
	if err := os.WriteFile(inPath, audio, 0o600); err != nil {
		return "", fmt.Errorf("write input: %w", err)
	}

	fctx, fcancel := context.WithTimeout(ctx, ffmpegTimeout)
	defer fcancel()
	ff := exec.CommandContext(fctx, "ffmpeg",
		"-nostdin", "-loglevel", "error", "-y",
		"-i", inPath,
		"-ar", "16000", "-ac", "1",
		"-t", strconv.Itoa(s.maxAudioSecs),
		"-f", "wav", wavPath,
	)
	if out, err := ff.CombinedOutput(); err != nil {
		return "", fmt.Errorf("ffmpeg: %w: %s", err, strings.TrimSpace(string(out)))
	}

	wctx, wcancel := context.WithTimeout(ctx, whisperTimeout)
	defer wcancel()
	w := exec.CommandContext(wctx, s.whisperBin,
		"-m", s.modelPath,
		"-l", "ru",
		"-nt",
		"-otxt",
		"-f", wavPath,
	)
	if out, err := w.CombinedOutput(); err != nil {
		return "", fmt.Errorf("whisper: %w: %s", err, strings.TrimSpace(string(out)))
	}

	txt, err := os.ReadFile(wavPath + ".txt")
	if err != nil {
		return "", fmt.Errorf("read transcript: %w", err)
	}
	return strings.TrimSpace(string(txt)), nil
}

func (s *sttConfig) observe(outcome string, start time.Time) {
	s.transcribeCnt.WithLabelValues(outcome).Inc()
	s.transcribeDur.WithLabelValues(outcome).Observe(time.Since(start).Seconds())
}

func transcribeHandler(s *sttConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		if c.Request().Header.ContentLength() > int(s.maxBytes) {
			s.observe("too_large", start)
			return c.Status(fiber.StatusRequestEntityTooLarge).
				JSON(fiber.Map{"error": "audio слишком большой"})
		}

		fh, err := c.FormFile("audio")
		if err != nil {
			s.observe("bad_request", start)
			return c.Status(fiber.StatusBadRequest).
				JSON(fiber.Map{"error": "ожидается поле audio в multipart/form-data"})
		}
		if fh.Size > s.maxBytes {
			s.observe("too_large", start)
			return c.Status(fiber.StatusRequestEntityTooLarge).
				JSON(fiber.Map{"error": "audio слишком большой"})
		}

		file, err := fh.Open()
		if err != nil {
			s.observe("read_error", start)
			return c.Status(fiber.StatusInternalServerError).
				JSON(fiber.Map{"error": "не удалось прочитать файл"})
		}
		defer file.Close()
		audio, err := io.ReadAll(io.LimitReader(file, s.maxBytes+1))
		if err != nil {
			s.observe("read_error", start)
			return c.Status(fiber.StatusInternalServerError).
				JSON(fiber.Map{"error": "не удалось прочитать файл"})
		}
		if int64(len(audio)) > s.maxBytes {
			s.observe("too_large", start)
			return c.Status(fiber.StatusRequestEntityTooLarge).
				JSON(fiber.Map{"error": "audio слишком большой"})
		}

		ctx, cancel := context.WithTimeout(c.UserContext(), whisperTimeout+ffmpegTimeout+5*time.Second)
		defer cancel()

		if err := s.sem.Acquire(ctx, 1); err != nil {
			s.observe("busy", start)
			return c.Status(fiber.StatusServiceUnavailable).
				JSON(fiber.Map{"error": "сервер занят, попробуйте ещё раз"})
		}
		defer s.sem.Release(1)

		text, err := s.transcribe(ctx, audio)
		if err != nil {
			outcome := classifyTranscribeErr(err)
			s.observe(outcome, start)
			slog.Warn("transcribe failed", "outcome", outcome, "error", err)
			return c.Status(fiber.StatusInternalServerError).
				JSON(fiber.Map{"error": "распознавание не удалось"})
		}

		s.observe("success", start)
		return c.JSON(fiber.Map{"text": text})
	}
}

func classifyTranscribeErr(err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	msg := err.Error()
	switch {
	case strings.HasPrefix(msg, "ffmpeg"):
		return "ffmpeg_error"
	case strings.HasPrefix(msg, "whisper"):
		return "whisper_error"
	default:
		return "error"
	}
}

// ── helpers ────────────────────────────────────────────────────────────────────

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getenvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func getenvInt64(key string, def int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return def
}

// ── main ───────────────────────────────────────────────────────────────────────

func main() {
	httpAddr := getenv("HTTP_ADDR", ":8001")

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	slog.Info("starting ai-medincident-stt")

	reg := prometheus.NewRegistry()
	reg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	stt := newSTTConfig(reg)

	modelCtx, modelCancel := context.WithTimeout(context.Background(), 15*time.Minute)
	if err := ensureModel(modelCtx, stt.modelPath, stt.modelURL); err != nil {
		modelCancel()
		log.Fatalf("cannot prepare whisper model: %v", err)
	}
	modelCancel()
	stt.modelReady = true

	app := fiber.New(fiber.Config{
		AppName:               "ai-medincident-stt",
		DisableStartupMessage: true,
		BodyLimit:             int(stt.maxBytes) + 1024*1024,
	})

	app.Get("/health", func(ctx *fiber.Ctx) error {
		return ctx.JSON(fiber.Map{
			"status":      "ok",
			"model_ready": stt.modelReady,
		})
	})

	app.Post("/transcribe", transcribeHandler(stt))

	app.Get("/metrics", adaptor.HTTPHandler(promhttp.HandlerFor(reg, promhttp.HandlerOpts{Registry: reg})))

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-shutdown
		slog.Info("shutdown signal received")
		_ = app.Shutdown()
	}()

	slog.Info("HTTP server listening", "addr", httpAddr)
	if err := app.Listen(httpAddr); err != nil {
		log.Fatalf("HTTP server failed: %v", err)
	}
}
