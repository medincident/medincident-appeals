using AiMedincident.Backend.Features.Appeals;

namespace AiMedincident.Backend.UnitTests.Appeals;

public class AppealsConsumerBackoffTests
{
    [Theory]
    [InlineData(1, 2.0)]
    [InlineData(2, 4.0)]
    [InlineData(3, 8.0)]
    [InlineData(4, 16.0)]
    [InlineData(5, 32.0)]
    [InlineData(6, 64.0)]
    [InlineData(7, 128.0)]
    public void ComputeBackoff_within_jitter_around_base(int attempt, double baseSeconds)
    {
        // jitter ± 30% — деление на (1 ± 0.3)
        var lower = baseSeconds * 0.7;
        var upper = baseSeconds * 1.3;

        // Прогоняем 50 раз, чтобы jitter не выпал на edge case
        for (var i = 0; i < 50; i++)
        {
            var delay = AppealsConsumer.ComputeBackoff(attempt);
            delay.TotalSeconds.Should().BeInRange(lower, upper);
        }
    }

    [Fact]
    public void ComputeBackoff_caps_at_180_seconds()
    {
        // attempt=10 даст base=1024s, после cap=180s, плюс jitter — макс ~234s
        var delay = AppealsConsumer.ComputeBackoff(10);
        delay.TotalSeconds.Should().BeLessThanOrEqualTo(180.0 * 1.3);
        delay.TotalSeconds.Should().BeGreaterThanOrEqualTo(180.0 * 0.7);
    }

    [Fact]
    public void ComputeBackoff_treats_zero_or_negative_as_one()
    {
        var d0 = AppealsConsumer.ComputeBackoff(0);
        var d1 = AppealsConsumer.ComputeBackoff(1);
        var dMinus = AppealsConsumer.ComputeBackoff(-5);

        // Все три должны быть в одном диапазоне (attempt=1, base=2s ± 30%)
        d0.TotalSeconds.Should().BeInRange(1.4, 2.6);
        d1.TotalSeconds.Should().BeInRange(1.4, 2.6);
        dMinus.TotalSeconds.Should().BeInRange(1.4, 2.6);
    }

    [Fact]
    public void ComputeBackoff_is_deterministic_with_seeded_rng()
    {
        var rng1 = new Random(42);
        var rng2 = new Random(42);

        var d1 = AppealsConsumer.ComputeBackoff(3, rng1);
        var d2 = AppealsConsumer.ComputeBackoff(3, rng2);

        d1.Should().Be(d2);
    }
}
