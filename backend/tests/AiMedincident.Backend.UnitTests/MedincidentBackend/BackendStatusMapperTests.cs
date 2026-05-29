using AiMedincident.Backend.Features.Appeals.Data.Db;
using AiMedincident.Backend.Features.MedincidentBackend;

namespace AiMedincident.Backend.UnitTests.MedincidentBackend;

public class BackendStatusMapperTests
{
    [Theory]
    [InlineData("pending", AppealStatus.Submitted)]
    [InlineData("published", AppealStatus.Accepted)]
    [InlineData("rejected", AppealStatus.Closed)]
    [InlineData("cancelled", AppealStatus.Cancelled)]
    [InlineData("BUFFER_STATUS_PUBLISHED", AppealStatus.Accepted)] // enum-форма
    public void Maps_buffer_status(string raw, AppealStatus expected)
    {
        BackendStatusMapper.FromBufferStatus(raw).Should().Be(expected);
    }

    [Theory]
    [InlineData("pending", AppealStatus.Accepted)]
    [InlineData("in_progress", AppealStatus.Accepted)]
    [InlineData("done", AppealStatus.Closed)]
    [InlineData("rejected", AppealStatus.Closed)]
    [InlineData("cancelled", AppealStatus.Cancelled)]
    [InlineData("INCIDENT_STATUS_DONE", AppealStatus.Closed)]
    public void Maps_incident_status(string raw, AppealStatus expected)
    {
        BackendStatusMapper.FromIncidentStatus(raw).Should().Be(expected);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("unknown")]
    public void Unknown_or_empty_yields_null(string? raw)
    {
        BackendStatusMapper.FromBufferStatus(raw).Should().BeNull();
        BackendStatusMapper.FromIncidentStatus(raw).Should().BeNull();
    }
}
