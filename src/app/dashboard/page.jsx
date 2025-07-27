"use client";
import React from "react";

function MainComponent() {
  const [dashboardData, setDashboardData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [selectedTimeRange, setSelectedTimeRange] = React.useState("7d");
  const [selectedLocation, setSelectedLocation] = React.useState({
    lat: 40.7128,
    lng: -74.006,
  });
  const [activeTab, setActiveTab] = React.useState("overview");
  const [measurements, setMeasurements] = React.useState([]);
  const [modelMetrics, setModelMetrics] = React.useState([]);
  const [exportFormat, setExportFormat] = React.useState("json");
  const [importData, setImportData] = React.useState("");
  const [lastUpdate, setLastUpdate] = React.useState(null);

  const fetchDashboardData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (selectedTimeRange) {
        case "24h":
          startDate.setHours(startDate.getHours() - 24);
          break;
        case "7d":
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(startDate.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      const [measurementsResponse, modelMetricsResponse] = await Promise.all([
        fetch("/api/get-pm25-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: selectedLocation.lat,
            longitude: selectedLocation.lng,
            radius: 100,
            includePredictions: true,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            minDataQuality: 0.5,
          }),
        }),
        fetch("/api/create-model-metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model_name: "dashboard_query",
            rmse: 0,
            r_squared: 0,
            mae: 0,
            validation_score: 0,
            training_samples: 0,
          }),
        }),
      ]);

      if (!measurementsResponse.ok) {
        throw new Error("Failed to fetch measurements data");
      }

      const measurementsData = await measurementsResponse.json();

      if (measurementsData.success) {
        setMeasurements(measurementsData.data || []);
        setDashboardData(measurementsData);
        setLastUpdate(new Date());
      } else {
        throw new Error(
          measurementsData.error || "Failed to load dashboard data"
        );
      }
    } catch (err) {
      console.error("Dashboard data fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, selectedTimeRange]);

  React.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const exportData = React.useCallback(() => {
    if (!measurements.length) {
      alert("No data available to export");
      return;
    }

    let exportContent = "";
    let filename = "";
    let mimeType = "";

    switch (exportFormat) {
      case "json":
        exportContent = JSON.stringify(
          {
            metadata: {
              exported_at: new Date().toISOString(),
              total_records: measurements.length,
              time_range: selectedTimeRange,
              location: selectedLocation,
            },
            data: measurements,
            statistics: dashboardData?.statistics,
          },
          null,
          2
        );
        filename = `pm25_data_${selectedTimeRange}_${Date.now()}.json`;
        mimeType = "application/json";
        break;

      case "csv":
        const headers = [
          "id",
          "latitude",
          "longitude",
          "pm25_value",
          "measurement_date",
          "data_source",
          "is_prediction",
        ];
        const csvRows = [headers.join(",")];
        measurements.forEach((row) => {
          const values = headers.map((header) => {
            const value = row[header];
            return typeof value === "string" ? `"${value}"` : value;
          });
          csvRows.push(values.join(","));
        });
        exportContent = csvRows.join("\n");
        filename = `pm25_data_${selectedTimeRange}_${Date.now()}.csv`;
        mimeType = "text/csv";
        break;
    }

    const blob = new Blob([exportContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [
    measurements,
    exportFormat,
    selectedTimeRange,
    selectedLocation,
    dashboardData,
  ]);

  const importDataHandler = React.useCallback(async () => {
    if (!importData.trim()) {
      alert("Please enter data to import");
      return;
    }

    try {
      const parsedData = JSON.parse(importData);

      if (!Array.isArray(parsedData)) {
        throw new Error("Data must be an array of measurements");
      }

      let successCount = 0;
      let errorCount = 0;

      for (const item of parsedData) {
        try {
          const response = await fetch("/api/create-measurement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          errorCount++;
        }
      }

      alert(
        `Import completed: ${successCount} successful, ${errorCount} failed`
      );
      setImportData("");
      fetchDashboardData();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  }, [importData, fetchDashboardData]);

  const getAQICategory = (pm25Value) => {
    if (pm25Value <= 12) return { category: "Good", color: "#00e400" };
    if (pm25Value <= 35.4) return { category: "Moderate", color: "#00BFFF" };
    if (pm25Value <= 55.4)
      return { category: "Unhealthy for Sensitive", color: "#FF6600" };
    if (pm25Value <= 150.4) return { category: "Unhealthy", color: "#FF0000" };
    if (pm25Value <= 250.4)
      return { category: "Very Unhealthy", color: "#9932CC" };
    return { category: "Hazardous", color: "#8B0000" };
  };

  const generateTimeSeriesData = React.useCallback(() => {
    if (!measurements.length) return [];

    const sortedData = measurements
      .filter((m) => m.measurement_date)
      .sort(
        (a, b) => new Date(a.measurement_date) - new Date(b.measurement_date)
      );

    return sortedData.map((m) => ({
      date: new Date(m.measurement_date).toLocaleDateString(),
      time: new Date(m.measurement_date).toLocaleTimeString(),
      pm25: parseFloat(m.pm25_value),
      isPrediction: m.is_prediction,
      dataSource: m.data_source,
    }));
  }, [measurements]);

  const timeSeriesData = generateTimeSeriesData();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "15px",
            padding: "40px",
            textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          }}
        >
          <i
            className="fas fa-chart-line"
            style={{ fontSize: "3rem", color: "#667eea", marginBottom: "20px" }}
          ></i>
          <h2 style={{ color: "#333", marginBottom: "10px" }}>
            Loading Analytics Dashboard
          </h2>
          <p style={{ color: "#666" }}>
            Fetching comprehensive PM2.5 data and metrics...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        {/* Navigation Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "15px",
            marginBottom: "20px",
          }}
        >
          <a
            href="/"
            style={{
              padding: "10px 20px",
              background: "rgba(255,255,255,0.2)",
              color: "white",
              textDecoration: "none",
              borderRadius: "20px",
              fontSize: "14px",
              fontWeight: "600",
              transition: "all 0.3s ease",
              border: "2px solid rgba(255,255,255,0.3)",
            }}
            onMouseOver={(e) => {
              e.target.style.background = "white";
              e.target.style.color = "#667eea";
            }}
            onMouseOut={(e) => {
              e.target.style.background = "rgba(255,255,255,0.2)";
              e.target.style.color = "white";
            }}
          >
            🎯 Predictor
          </a>
          <a
            href="/dashboard"
            style={{
              padding: "10px 20px",
              background: "white",
              color: "#667eea",
              textDecoration: "none",
              borderRadius: "20px",
              fontSize: "14px",
              fontWeight: "600",
              transition: "all 0.3s ease",
              border: "2px solid white",
            }}
          >
            📊 Analytics
          </a>
          <a
            href="/manage"
            style={{
              padding: "10px 20px",
              background: "rgba(255,255,255,0.2)",
              color: "white",
              textDecoration: "none",
              borderRadius: "20px",
              fontSize: "14px",
              fontWeight: "600",
              transition: "all 0.3s ease",
              border: "2px solid rgba(255,255,255,0.3)",
            }}
            onMouseOver={(e) => {
              e.target.style.background = "white";
              e.target.style.color = "#667eea";
            }}
            onMouseOut={(e) => {
              e.target.style.background = "rgba(255,255,255,0.2)";
              e.target.style.color = "white";
            }}
          >
            🛠️ Manage Data
          </a>
        </div>

        <div
          style={{ textAlign: "center", marginBottom: "30px", color: "white" }}
        >
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: "bold",
              marginBottom: "10px",
              textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            PM2.5 Analytics Dashboard
          </h1>
          <p style={{ fontSize: "1.1rem", opacity: 0.9 }}>
            Comprehensive data analysis, model performance tracking, and
            management tools
          </p>
          {lastUpdate && (
            <p style={{ fontSize: "0.9rem", opacity: 0.8, marginTop: "10px" }}>
              Last updated: {lastUpdate.toLocaleString()}
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "20px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {["overview", "trends", "quality", "models", "management"].map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "12px 24px",
                  background:
                    activeTab === tab ? "white" : "rgba(255,255,255,0.2)",
                  color: activeTab === tab ? "#667eea" : "white",
                  border: "none",
                  borderRadius: "25px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  textTransform: "capitalize",
                }}
              >
                {tab === "management" ? "Data Management" : tab}
              </button>
            )
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "15px",
            marginBottom: "20px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            style={{
              padding: "10px 15px",
              borderRadius: "8px",
              border: "none",
              fontSize: "14px",
              background: "white",
              color: "#333",
            }}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            style={{
              padding: "10px 20px",
              background: loading ? "#ccc" : "#28a745",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <i className="fas fa-sync-alt" style={{ marginRight: "8px" }}></i>
            Refresh Data
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "#fee",
              border: "1px solid #fcc",
              borderRadius: "8px",
              padding: "15px",
              marginBottom: "20px",
              color: "#c33",
              textAlign: "center",
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {activeTab === "overview" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                window.innerWidth > 768 ? "1fr 1fr 1fr" : "1fr",
              gap: "20px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: "15px",
                padding: "25px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                textAlign: "center",
              }}
            >
              <i
                className="fas fa-database"
                style={{
                  fontSize: "2.5rem",
                  color: "#667eea",
                  marginBottom: "15px",
                }}
              ></i>
              <h3
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "600",
                  marginBottom: "10px",
                  color: "#333",
                }}
              >
                Total Measurements
              </h3>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: "bold",
                  color: "#667eea",
                }}
              >
                {dashboardData?.statistics?.total_measurements || 0}
              </div>
              <div
                style={{ fontSize: "14px", color: "#666", marginTop: "5px" }}
              >
                Real: {dashboardData?.statistics?.real_measurements || 0} |
                Predictions: {dashboardData?.statistics?.predictions || 0}
              </div>
            </div>

            <div
              style={{
                background: "white",
                borderRadius: "15px",
                padding: "25px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                textAlign: "center",
              }}
            >
              <i
                className="fas fa-chart-line"
                style={{
                  fontSize: "2.5rem",
                  color: "#28a745",
                  marginBottom: "15px",
                }}
              ></i>
              <h3
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "600",
                  marginBottom: "10px",
                  color: "#333",
                }}
              >
                Average PM2.5
              </h3>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: "bold",
                  color: "#28a745",
                }}
              >
                {dashboardData?.statistics?.avg_pm25 || 0} μg/m³
              </div>
              <div
                style={{ fontSize: "14px", color: "#666", marginTop: "5px" }}
              >
                Range: {dashboardData?.statistics?.min_pm25 || 0} -{" "}
                {dashboardData?.statistics?.max_pm25 || 0}
              </div>
            </div>

            <div
              style={{
                background: "white",
                borderRadius: "15px",
                padding: "25px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                textAlign: "center",
              }}
            >
              <i
                className="fas fa-shield-alt"
                style={{
                  fontSize: "2.5rem",
                  color: "#ffc107",
                  marginBottom: "15px",
                }}
              ></i>
              <h3
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "600",
                  marginBottom: "10px",
                  color: "#333",
                }}
              >
                Data Quality
              </h3>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: "bold",
                  color: "#ffc107",
                }}
              >
                {Math.round(
                  (dashboardData?.statistics?.avg_data_quality || 0) * 100
                )}
                %
              </div>
              <div
                style={{ fontSize: "14px", color: "#666", marginTop: "5px" }}
              >
                High Quality:{" "}
                {dashboardData?.data_quality?.high_quality_measurements || 0}
              </div>
            </div>
          </div>
        )}

        {activeTab === "trends" && (
          <div
            style={{
              background: "white",
              borderRadius: "15px",
              padding: "25px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                marginBottom: "20px",
                color: "#333",
              }}
            >
              PM2.5 Time Series Analysis
            </h2>

            {timeSeriesData.length > 0 ? (
              <div>
                <div style={{ marginBottom: "20px", overflowX: "auto" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "2px",
                      minWidth: `${timeSeriesData.length * 8}px`,
                      height: "200px",
                      alignItems: "end",
                      padding: "20px 0",
                    }}
                  >
                    {timeSeriesData.map((point, index) => {
                      const maxValue = Math.max(
                        ...timeSeriesData.map((p) => p.pm25)
                      );
                      const height = (point.pm25 / maxValue) * 160;
                      const aqiInfo = getAQICategory(point.pm25);

                      return (
                        <div
                          key={index}
                          style={{
                            width: "6px",
                            height: `${height}px`,
                            background: point.isPrediction
                              ? `linear-gradient(to top, ${aqiInfo.color}80, ${aqiInfo.color})`
                              : aqiInfo.color,
                            borderRadius: "3px",
                            position: "relative",
                            cursor: "pointer",
                            border: point.isPrediction
                              ? "1px dashed rgba(0,0,0,0.3)"
                              : "none",
                          }}
                          title={`${point.date} ${point.time}: ${
                            point.pm25
                          } μg/m³ (${
                            point.isPrediction ? "Predicted" : "Measured"
                          })`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      window.innerWidth > 768 ? "1fr 1fr" : "1fr",
                    gap: "20px",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: "600",
                        marginBottom: "10px",
                        color: "#555",
                      }}
                    >
                      Recent Measurements
                    </h3>
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {timeSeriesData
                        .slice(-10)
                        .reverse()
                        .map((point, index) => {
                          const aqiInfo = getAQICategory(point.pm25);
                          return (
                            <div
                              key={index}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "8px 0",
                                borderBottom: "1px solid #eee",
                                fontSize: "14px",
                              }}
                            >
                              <span style={{ color: "#666" }}>
                                {point.date} {point.time}
                              </span>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                }}
                              >
                                <span style={{ fontWeight: "600" }}>
                                  {point.pm25} μg/m³
                                </span>
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "12px",
                                    fontSize: "12px",
                                    background: `${aqiInfo.color}20`,
                                    color: aqiInfo.color,
                                    fontWeight: "600",
                                  }}
                                >
                                  {aqiInfo.category}
                                </span>
                                {point.isPrediction && (
                                  <span
                                    style={{
                                      padding: "2px 6px",
                                      borderRadius: "10px",
                                      fontSize: "10px",
                                      background: "#e3f2fd",
                                      color: "#1976d2",
                                    }}
                                  >
                                    PRED
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div>
                    <h3
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: "600",
                        marginBottom: "10px",
                        color: "#555",
                      }}
                    >
                      AQI Distribution
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {[
                        "Good",
                        "Moderate",
                        "Unhealthy for Sensitive",
                        "Unhealthy",
                        "Very Unhealthy",
                        "Hazardous",
                      ].map((category) => {
                        const count = timeSeriesData.filter(
                          (point) =>
                            getAQICategory(point.pm25).category === category
                        ).length;
                        const percentage =
                          timeSeriesData.length > 0
                            ? (count / timeSeriesData.length) * 100
                            : 0;
                        const color = getAQICategory(
                          category === "Good"
                            ? 10
                            : category === "Moderate"
                            ? 25
                            : category === "Unhealthy for Sensitive"
                            ? 45
                            : category === "Unhealthy"
                            ? 100
                            : category === "Very Unhealthy"
                            ? 200
                            : 300
                        ).color;

                        return (
                          <div
                            key={category}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                            }}
                          >
                            <div
                              style={{
                                width: "12px",
                                height: "12px",
                                borderRadius: "50%",
                                background: color,
                              }}
                            ></div>
                            <span style={{ fontSize: "14px", flex: 1 }}>
                              {category}
                            </span>
                            <span
                              style={{ fontSize: "14px", fontWeight: "600" }}
                            >
                              {count} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{ textAlign: "center", color: "#888", padding: "40px" }}
              >
                <i
                  className="fas fa-chart-line"
                  style={{
                    fontSize: "3rem",
                    marginBottom: "15px",
                    opacity: 0.3,
                  }}
                ></i>
                <p>No time series data available for the selected period</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "quality" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: window.innerWidth > 768 ? "1fr 1fr" : "1fr",
              gap: "20px",
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: "15px",
                padding: "25px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              }}
            >
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  marginBottom: "20px",
                  color: "#333",
                }}
              >
                Data Quality Metrics
              </h2>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "15px",
                }}
              >
                <div
                  style={{
                    padding: "15px",
                    background: "#f8f9fa",
                    borderRadius: "8px",
                    border: "1px solid #e9ecef",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: "600",
                      marginBottom: "10px",
                      color: "#555",
                    }}
                  >
                    Quality Distribution
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "#28a745" }}>
                        High Quality (≥90%)
                      </span>
                      <span style={{ fontWeight: "600" }}>
                        {dashboardData?.data_quality
                          ?.high_quality_measurements || 0}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "#ffc107" }}>
                        Medium Quality (70-89%)
                      </span>
                      <span style={{ fontWeight: "600" }}>
                        {dashboardData?.data_quality
                          ?.medium_quality_measurements || 0}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "#dc3545" }}>
                        Low Quality (&lt;70%)
                      </span>
                      <span style={{ fontWeight: "600" }}>
                        {dashboardData?.data_quality
                          ?.low_quality_measurements || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "15px",
                    background: "#f8f9fa",
                    borderRadius: "8px",
                    border: "1px solid #e9ecef",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: "600",
                      marginBottom: "10px",
                      color: "#555",
                    }}
                  >
                    Data Sources
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {(dashboardData?.statistics?.data_sources || []).map(
                      (source) => {
                        const count = measurements.filter(
                          (m) => m.data_source === source
                        ).length;
                        return (
                          <div
                            key={source}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <span style={{ textTransform: "capitalize" }}>
                              {source}
                            </span>
                            <span style={{ fontWeight: "600" }}>{count}</span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                background: "white",
                borderRadius: "15px",
                padding: "25px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              }}
            >
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  marginBottom: "20px",
                  color: "#333",
                }}
              >
                Data Completeness
              </h2>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "15px",
                }}
              >
                {[
                  { field: "PM2.5", key: "pm25_complete" },
                  { field: "AOD", key: "aod_complete" },
                  { field: "NO₂", key: "no2_complete" },
                  { field: "Temperature", key: "temperature_complete" },
                  { field: "Humidity", key: "humidity_complete" },
                  { field: "Wind Speed", key: "wind_speed_complete" },
                ].map((item) => {
                  const count =
                    dashboardData?.data_completeness?.[item.key] || 0;
                  const total =
                    dashboardData?.statistics?.total_measurements || 1;
                  const percentage = (count / total) * 100;

                  return (
                    <div
                      key={item.field}
                      style={{
                        padding: "12px",
                        background: "#f8f9fa",
                        borderRadius: "8px",
                        border: "1px solid #e9ecef",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                        }}
                      >
                        <span style={{ fontWeight: "600" }}>{item.field}</span>
                        <span>
                          {count}/{total} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "6px",
                          background: "#e9ecef",
                          borderRadius: "3px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${percentage}%`,
                            height: "100%",
                            background:
                              percentage >= 80
                                ? "#28a745"
                                : percentage >= 50
                                ? "#ffc107"
                                : "#dc3545",
                            transition: "width 0.3s ease",
                          }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "models" && (
          <div
            style={{
              background: "white",
              borderRadius: "15px",
              padding: "25px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
                marginBottom: "20px",
                color: "#333",
              }}
            >
              Model Performance Analytics
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  window.innerWidth > 768 ? "1fr 1fr" : "1fr",
                gap: "20px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: "600",
                    marginBottom: "15px",
                    color: "#555",
                  }}
                >
                  Current Model Metrics
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      padding: "12px",
                      background: "#f8f9fa",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Model Version</span>
                    <span style={{ fontWeight: "600" }}>enhanced_rf_v2.0</span>
                  </div>
                  <div
                    style={{
                      padding: "12px",
                      background: "#f8f9fa",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Training Samples</span>
                    <span style={{ fontWeight: "600" }}>
                      {dashboardData?.training_samples || "N/A"}
                    </span>
                  </div>
                  <div
                    style={{
                      padding: "12px",
                      background: "#f8f9fa",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Data Quality Score</span>
                    <span style={{ fontWeight: "600", color: "#28a745" }}>
                      {Math.round(
                        (dashboardData?.model_performance?.data_quality_score ||
                          0) * 100
                      )}
                      %
                    </span>
                  </div>
                  <div
                    style={{
                      padding: "12px",
                      background: "#f8f9fa",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Prediction Stability</span>
                    <span style={{ fontWeight: "600", color: "#007bff" }}>
                      {Math.round(
                        (dashboardData?.model_performance
                          ?.prediction_stability || 0) * 100
                      )}
                      %
                    </span>
                  </div>
                  <div
                    style={{
                      padding: "12px",
                      background: "#f8f9fa",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Spatial Coverage</span>
                    <span style={{ fontWeight: "600", color: "#ffc107" }}>
                      {Math.round(
                        (dashboardData?.model_performance?.spatial_coverage ||
                          0) * 100
                      )}
                      %
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: "600",
                    marginBottom: "15px",
                    color: "#555",
                  }}
                >
                  Prediction vs Reality
                </h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {measurements
                    .filter((m) => m.is_prediction)
                    .slice(0, 5)
                    .map((pred, index) => {
                      const realMeasurements = measurements.filter(
                        (m) =>
                          !m.is_prediction &&
                          Math.abs(
                            parseFloat(m.latitude) - parseFloat(pred.latitude)
                          ) < 0.01 &&
                          Math.abs(
                            parseFloat(m.longitude) - parseFloat(pred.longitude)
                          ) < 0.01
                      );

                      const avgReal =
                        realMeasurements.length > 0
                          ? realMeasurements.reduce(
                              (sum, m) => sum + parseFloat(m.pm25_value),
                              0
                            ) / realMeasurements.length
                          : null;

                      const accuracy = avgReal
                        ? Math.max(
                            0,
                            100 -
                              (Math.abs(parseFloat(pred.pm25_value) - avgReal) /
                                avgReal) *
                                100
                          )
                        : null;

                      return (
                        <div
                          key={index}
                          style={{
                            padding: "12px",
                            background: "#f8f9fa",
                            borderRadius: "8px",
                            border: "1px solid #e9ecef",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "5px",
                            }}
                          >
                            <span
                              style={{ fontSize: "14px", fontWeight: "600" }}
                            >
                              Prediction:{" "}
                              {parseFloat(pred.pm25_value).toFixed(1)} μg/m³
                            </span>
                            {avgReal && (
                              <span style={{ fontSize: "14px" }}>
                                Actual: {avgReal.toFixed(1)} μg/m³
                              </span>
                            )}
                          </div>
                          {accuracy && (
                            <div
                              style={{
                                fontSize: "12px",
                                color:
                                  accuracy > 80
                                    ? "#28a745"
                                    : accuracy > 60
                                    ? "#ffc107"
                                    : "#dc3545",
                              }}
                            >
                              Accuracy: {accuracy.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "management" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: window.innerWidth > 768 ? "1fr 1fr" : "1fr",
              gap: "20px",
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: "15px",
                padding: "25px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              }}
            >
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  marginBottom: "20px",
                  color: "#333",
                }}
              >
                Export Data
              </h2>

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#555",
                  }}
                >
                  Export Format
                </label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                >
                  <option value="json">JSON Format</option>
                  <option value="csv">CSV Format</option>
                </select>
              </div>

              <button
                onClick={exportData}
                disabled={!measurements.length}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: measurements.length ? "#007bff" : "#ccc",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: measurements.length ? "pointer" : "not-allowed",
                }}
              >
                <i
                  className="fas fa-download"
                  style={{ marginRight: "8px" }}
                ></i>
                Export {measurements.length} Records
              </button>

              <div
                style={{ marginTop: "15px", fontSize: "14px", color: "#666" }}
              >
                <p>
                  <strong>Export includes:</strong>
                </p>
                <ul style={{ marginLeft: "20px", marginTop: "5px" }}>
                  <li>All measurement data</li>
                  <li>Quality metrics</li>
                  <li>Statistical summaries</li>
                  <li>Metadata and timestamps</li>
                </ul>
              </div>
            </div>

            <div
              style={{
                background: "white",
                borderRadius: "15px",
                padding: "25px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              }}
            >
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  marginBottom: "20px",
                  color: "#333",
                }}
              >
                Import Data
              </h2>

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#555",
                  }}
                >
                  JSON Data (Array of measurements)
                </label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder='[{"latitude": 40.7128, "longitude": -74.006, "pm25_value": 25.5, ...}]'
                  style={{
                    width: "100%",
                    height: "120px",
                    padding: "10px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontFamily: "monospace",
                    resize: "vertical",
                  }}
                />
              </div>

              <button
                onClick={importDataHandler}
                disabled={!importData.trim()}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: importData.trim() ? "#28a745" : "#ccc",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: importData.trim() ? "pointer" : "not-allowed",
                }}
              >
                <i className="fas fa-upload" style={{ marginRight: "8px" }}></i>
                Import Data
              </button>

              <div
                style={{ marginTop: "15px", fontSize: "14px", color: "#666" }}
              >
                <p>
                  <strong>Required fields:</strong>
                </p>
                <ul style={{ marginLeft: "20px", marginTop: "5px" }}>
                  <li>latitude, longitude</li>
                  <li>pm25_value</li>
                </ul>
                <p style={{ marginTop: "10px" }}>
                  <strong>Optional fields:</strong>
                </p>
                <ul style={{ marginLeft: "20px", marginTop: "5px" }}>
                  <li>aod_value, no2_value</li>
                  <li>temperature, humidity, wind_speed</li>
                  <li>data_source, is_prediction</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            background: "rgba(255,255,255,0.95)",
            borderRadius: "15px",
            padding: "20px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            marginTop: "20px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "30px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  background: "#00e400",
                  borderRadius: "50%",
                }}
              ></div>
              <span style={{ fontSize: "14px" }}>Good (0-12)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  background: "#00BFFF",
                  borderRadius: "50%",
                }}
              ></div>
              <span style={{ fontSize: "14px" }}>Moderate (12-35)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  background: "#FF6600",
                  borderRadius: "50%",
                }}
              ></div>
              <span style={{ fontSize: "14px" }}>
                Unhealthy for Sensitive (35-55)
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  background: "#FF0000",
                  borderRadius: "50%",
                }}
              ></div>
              <span style={{ fontSize: "14px" }}>Unhealthy (55-150)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  background: "#9932CC",
                  borderRadius: "50%",
                }}
              ></div>
              <span style={{ fontSize: "14px" }}>Very Unhealthy (150-250)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  background: "#8B0000",
                  borderRadius: "50%",
                }}
              ></div>
              <span style={{ fontSize: "14px" }}>Hazardous (250+)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MainComponent;