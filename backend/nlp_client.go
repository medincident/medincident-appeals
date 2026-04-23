package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const nlpAnalyzeTimeout = 30 * time.Second

type NLPClient struct {
	baseURL string
	http    *http.Client
}

type NLPAnalyzeResponse struct {
	IsImportant         bool              `json:"is_important"`
	ImportantConfidence float64           `json:"important_confidence,omitempty"`
	Reason              string            `json:"reason,omitempty"`
	FormalizedText      string            `json:"formalized_text,omitempty"`
	Theses              []string          `json:"theses,omitempty"`
	Category            map[string]string `json:"category,omitempty"`
	Subcategory         map[string]string `json:"subcategory,omitempty"`
}

func NewNLPClient(baseURL string) *NLPClient {
	return &NLPClient{
		baseURL: baseURL,
		http: &http.Client{
			Timeout: nlpAnalyzeTimeout + 5*time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        32,
				MaxIdleConnsPerHost: 16,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

func (c *NLPClient) Analyze(ctx context.Context, text string) (*NLPAnalyzeResponse, error) {
	payload, err := json.Marshal(map[string]any{"text": text})
	if err != nil {
		return nil, err
	}
	rctx, cancel := context.WithTimeout(ctx, nlpAnalyzeTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(rctx, http.MethodPost, c.baseURL+"/analyze",
		bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("nlp-service %d: %s", resp.StatusCode, body)
	}
	var out NLPAnalyzeResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode nlp response: %w", err)
	}
	return &out, nil
}
