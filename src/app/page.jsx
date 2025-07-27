"use client";
import React from "react";

function MainComponent() {
  const [selectedLocation, setSelectedLocation] = React.useState({
    lat: 40.7128,
    lng: -74.006,
  });
  const [prediction, setPrediction] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [measurements, setMeasurements] = React.useState([]);
  const [showMap, setShowMap] = React.useState(true);
  const [inputValues, setInputValues] = React.useState({
    aod_value: 0.15,
    no2_value: 0.000025,
    temperature: 22,
    humidity: 65,
    wind_speed: 3.5,
  });
  const [dataStats, setDataStats] = React.useState(null);
  const [liveMode, setLiveMode] = React.useState(false);
  const [autoLocation, setAutoLocation] = React.useState(false);
  const [lastUpdate, setLastUpdate] = React.useState(null);
  const [locationAccuracy, setLocationAccuracy] = React.useState(null);
  const [liveStatus, setLiveStatus] = React.useState("Standby");
  const [environmentalLoading, setEnvironmentalLoading] = React.useState(false);
  const [environmentalDataSource, setEnvironmentalDataSource] =
    React.useState(null);
  const [autoPopulateEnabled, setAutoPopulateEnabled] = React.useState(true);

  // Fetch nearby measurements with enhanced accuracy tracking
  const fetchMeasurements = React.useCallback(async (lat, lng) => {
    try {
      const response = await fetch("/api/get-pm25-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          radius: 50,
          includePredictions: true,
          minDataQuality: 0.8,
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch measurements");

      const data = await response.json();
      if (data.success) {
        setMeasurements(data.data || []);
        setDataStats(data.statistics);
      }
    } catch (err) {
      console.error("Error fetching measurements:", err);
    }
  }, []);

  // Fetch environmental data for location
  const fetchEnvironmentalData = React.useCallback(
    async (lat, lng) => {
      if (!autoPopulateEnabled) return;

      setEnvironmentalLoading(true);
      try {
        const response = await fetch("/api/get-environmental-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            radius: 50,
            includeHistorical: true,
            fallbackToEstimates: true,
          }),
        });

        if (!response.ok) throw new Error("Failed to fetch environmental data");

        const data = await response.json();
        if (data.success) {
          setInputValues((prev) => ({
            ...prev,
            aod_value: data.environmental_data.aod_value,
            no2_value: data.environmental_data.no2_value,
            temperature: data.environmental_data.temperature,
            humidity: data.environmental_data.humidity,
            wind_speed: data.environmental_data.wind_speed,
          }));

          setEnvironmentalDataSource({
            methods: data.estimation_methods,
            dataQuality: data.data_quality,
            statistics: data.statistics,
            lastFetched: new Date(),
          });
        }
      } catch (err) {
        console.error("Error fetching environmental data:", err);
      } finally {
        setEnvironmentalLoading(false);
      }
    },
    [autoPopulateEnabled]
  );

  // Handle manual location changes
  const handleLocationChange = React.useCallback(
    (field, value) => {
      const newLocation = {
        ...selectedLocation,
        [field]: parseFloat(value) || 0,
      };
      setSelectedLocation(newLocation);

      // Debounce environmental data fetching for manual input
      clearTimeout(window.locationChangeTimeout);
      window.locationChangeTimeout = setTimeout(() => {
        fetchMeasurements(newLocation.lat, newLocation.lng);
        fetchEnvironmentalData(newLocation.lat, newLocation.lng);
      }, 1000);
    },
    [selectedLocation, fetchMeasurements, fetchEnvironmentalData]
  );

  // Auto-location detection function
  const detectCurrentLocation = React.useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser");
      return;
    }

    setLoading(true);
    setLiveStatus("Detecting location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setSelectedLocation({ lat: latitude, lng: longitude });
        setLocationAccuracy(accuracy);
        setAutoLocation(true);
        setLastUpdate(new Date());
        setLiveStatus("Location detected");
        setLoading(false);

        fetchMeasurements(latitude, longitude);
        fetchEnvironmentalData(latitude, longitude);
      },
      (error) => {
        console.error("Geolocation error:", error);
        setError(`Location detection failed: ${error.message}`);
        setLiveStatus("Location detection failed");
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, [fetchMeasurements, fetchEnvironmentalData]);

  // Enhanced prediction with accuracy validation
  const predictPM25 = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    const validationErrors = [];
    if (inputValues.aod_value < 0 || inputValues.aod_value > 5) {
      validationErrors.push("AOD value should be between 0 and 5");
    }
    if (inputValues.no2_value < 0 || inputValues.no2_value > 0.001) {
      validationErrors.push("NO₂ value should be between 0 and 0.001");
    }
    if (inputValues.temperature < -50 || inputValues.temperature > 60) {
      validationErrors.push("Temperature should be between -50°C and 60°C");
    }
    if (inputValues.humidity < 0 || inputValues.humidity > 100) {
      validationErrors.push("Humidity should be between 0% and 100%");
    }
    if (inputValues.wind_speed < 0 || inputValues.wind_speed > 50) {
      validationErrors.push("Wind speed should be between 0 and 50 m/s");
    }

    if (validationErrors.length > 0) {
      setError("Input validation errors: " + validationErrors.join(", "));
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/predict-pm25", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: selectedLocation.lat,
          longitude: selectedLocation.lng,
          ...inputValues,
        }),
      });

      if (!response.ok) throw new Error("Failed to get prediction");

      const data = await response.json();
      if (data.success) {
        setPrediction(data.prediction);
        setDataStats(data);
        setLastUpdate(new Date());
        fetchMeasurements(selectedLocation.lat, selectedLocation.lng);
      } else {
        setError(data.error || "Prediction failed");
      }
    } catch (err) {
      console.error("Prediction error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, inputValues, fetchMeasurements]);

  // Enhanced OpenAQ data fetching
  const fetchOpenAQData = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/fetch-openaq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coordinates: {
            latitude: selectedLocation.lat,
            longitude: selectedLocation.lng,
          },
          radius: 100,
          limit: 50,
        }),
      });

      const data = await response.json();
      if (data.success) {
        const message = data.note
          ? `${data.message} (${data.inserted} records)`
          : `Fetched ${data.inserted} new measurements from OpenAQ`;
        alert(message);
        fetchMeasurements(selectedLocation.lat, selectedLocation.lng);
      } else {
        setError(data.error || "Failed to fetch OpenAQ data");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, fetchMeasurements]);

  // Live mode monitoring
  React.useEffect(() => {
    let interval;

    if (liveMode) {
      setLiveStatus("Live monitoring active");
      interval = setInterval(() => {
        if (autoLocation) {
          detectCurrentLocation();
        }
        predictPM25();
      }, 30000);
    } else {
      setLiveStatus("Standby");
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [liveMode, autoLocation, detectCurrentLocation, predictPM25]);

  // Enhanced AQI info with accuracy indicators
  const getAQIInfo = (pm25Value) => {
    if (pm25Value <= 12)
      return {
        category: "Good",
        color: "#00e400",
        level: 1,
        description: "Air quality is excellent",
      };
    if (pm25Value <= 35.4)
      return {
        category: "Moderate",
        color: "#00BFFF",
        level: 2,
        description: "Air quality is acceptable",
      };
    if (pm25Value <= 55.4)
      return {
        category: "Unhealthy for Sensitive Groups",
        color: "#FF6600",
        level: 3,
        description: "Sensitive individuals should reduce exposure",
      };
    if (pm25Value <= 150.4)
      return {
        category: "Unhealthy",
        color: "#FF0000",
        level: 4,
        description: "Everyone should reduce outdoor activities",
      };
    if (pm25Value <= 250.4)
      return {
        category: "Very Unhealthy",
        color: "#9932CC",
        level: 5,
        description: "Avoid outdoor activities",
      };
    return {
      category: "Hazardous",
      color: "#8B0000",
      level: 6,
      description: "Emergency conditions - stay indoors",
    };
  };

  React.useEffect(() => {
    fetchMeasurements(selectedLocation.lat, selectedLocation.lng);
  }, [selectedLocation, fetchMeasurements]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
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
          style={{
            textAlign: "center",
            marginBottom: "30px",
            color: "white",
          }}
        >
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: "bold",
              marginBottom: "10px",
              textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            High-Precision PM2.5 Monitor
          </h1>
          <p
            style={{
              fontSize: "1.1rem",
              opacity: 0.9,
              maxWidth: "700px",
              margin: "0 auto",
            }}
          >
            Advanced machine learning system with enhanced accuracy validation
            and comprehensive data quality controls
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: window.innerWidth > 768 ? "1fr 1fr" : "1fr",
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
              Location & Parameters
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
                Location (Lat, Lng)
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  type="number"
                  step="0.0001"
                  value={selectedLocation.lat}
                  onChange={(e) =>
                    setSelectedLocation((prev) => ({
                      ...prev,
                      lat: parseFloat(e.target.value) || 0,
                    }))
                  }
                  style={{
                    flex: 1,
                    padding: "10px",
                    border: "2px solid #e1e5e9",
                    borderRadius: "8px",
                    fontSize: "14px",
                  }}
                  placeholder="Latitude (-90 to 90)"
                  min="-90"
                  max="90"
                />
                <input
                  type="number"
                  step="0.0001"
                  value={selectedLocation.lng}
                  onChange={(e) =>
                    setSelectedLocation((prev) => ({
                      ...prev,
                      lng: parseFloat(e.target.value) || 0,
                    }))
                  }
                  style={{
                    flex: 1,
                    padding: "10px",
                    border: "2px solid #e1e5e9",
                    borderRadius: "8px",
                    fontSize: "14px",
                  }}
                  placeholder="Longitude (-180 to 180)"
                  min="-180"
                  max="180"
                />
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "15px",
                }}
              >
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: "600",
                    color: "#555",
                    margin: 0,
                  }}
                >
                  🔴 Live Detection System
                </h3>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: liveMode ? "#00e400" : "#ccc",
                      animation: liveMode ? "pulse 2s infinite" : "none",
                    }}
                  ></div>
                  <span
                    style={{
                      fontSize: "12px",
                      color: liveMode ? "#00e400" : "#666",
                      fontWeight: "600",
                    }}
                  >
                    {liveMode ? "LIVE" : "OFF"}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginBottom: "15px",
                }}
              >
                <button
                  onClick={detectCurrentLocation}
                  disabled={loading}
                  style={{
                    padding: "10px 15px",
                    background: autoLocation ? "#28a745" : "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                  }}
                >
                  <i className="fas fa-crosshairs"></i>
                  {autoLocation ? "📍 Located" : "🎯 Auto-Locate"}
                </button>

                <button
                  onClick={() => setLiveMode(!liveMode)}
                  disabled={loading}
                  style={{
                    padding: "10px 15px",
                    background: liveMode ? "#dc3545" : "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                  }}
                >
                  <i className={`fas ${liveMode ? "fa-stop" : "fa-play"}`}></i>
                  {liveMode ? "🔴 Stop Live" : "▶️ Start Live"}
                </button>
              </div>

              <div
                style={{
                  padding: "12px",
                  background: liveMode ? "#e8f5e8" : "#f8f9fa",
                  border: `1px solid ${liveMode ? "#28a745" : "#ddd"}`,
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <strong style={{ color: "#555" }}>Status:</strong>
                  <span
                    style={{
                      color: liveMode ? "#28a745" : "#666",
                      fontWeight: "600",
                    }}
                  >
                    {liveStatus}
                  </span>
                </div>

                {lastUpdate && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "12px",
                      color: "#666",
                    }}
                  >
                    <span>Last Update:</span>
                    <span>{lastUpdate.toLocaleTimeString()}</span>
                  </div>
                )}

                {locationAccuracy && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "12px",
                      color: "#666",
                      marginTop: "4px",
                    }}
                  >
                    <span>GPS Accuracy:</span>
                    <span>±{Math.round(locationAccuracy)}m</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  fontSize: "1.1rem",
                  fontWeight: "600",
                  marginBottom: "15px",
                  color: "#555",
                }}
              >
                Environmental Data (Validated)
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "15px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      marginBottom: "5px",
                      color: "#666",
                    }}
                  >
                    AOD Value (0-5)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max="5"
                    value={inputValues.aod_value}
                    onChange={(e) =>
                      setInputValues((prev) => ({
                        ...prev,
                        aod_value: parseFloat(e.target.value) || 0,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      border:
                        inputValues.aod_value < 0 || inputValues.aod_value > 5
                          ? "2px solid #ff4444"
                          : "1px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      marginBottom: "5px",
                      color: "#666",
                    }}
                  >
                    NO₂ (0-0.001 mol/m²)
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    max="0.001"
                    value={inputValues.no2_value}
                    onChange={(e) =>
                      setInputValues((prev) => ({
                        ...prev,
                        no2_value: parseFloat(e.target.value) || 0,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      border:
                        inputValues.no2_value < 0 ||
                        inputValues.no2_value > 0.001
                          ? "2px solid #ff4444"
                          : "1px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      marginBottom: "5px",
                      color: "#666",
                    }}
                  >
                    Temperature (-50 to 60°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="-50"
                    max="60"
                    value={inputValues.temperature}
                    onChange={(e) =>
                      setInputValues((prev) => ({
                        ...prev,
                        temperature: parseFloat(e.target.value) || 0,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      border:
                        inputValues.temperature < -50 ||
                        inputValues.temperature > 60
                          ? "2px solid #ff4444"
                          : "1px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      marginBottom: "5px",
                      color: "#666",
                    }}
                  >
                    Humidity (0-100%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={inputValues.humidity}
                    onChange={(e) =>
                      setInputValues((prev) => ({
                        ...prev,
                        humidity: parseFloat(e.target.value) || 0,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      border:
                        inputValues.humidity < 0 || inputValues.humidity > 100
                          ? "2px solid #ff4444"
                          : "1px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "14px",
                      marginBottom: "5px",
                      color: "#666",
                    }}
                  >
                    Wind Speed (0-50 m/s)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="50"
                    value={inputValues.wind_speed}
                    onChange={(e) =>
                      setInputValues((prev) => ({
                        ...prev,
                        wind_speed: parseFloat(e.target.value) || 0,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      border:
                        inputValues.wind_speed < 0 ||
                        inputValues.wind_speed > 50
                          ? "2px solid #ff4444"
                          : "1px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={predictPM25}
                disabled={loading}
                style={{
                  flex: 1,
                  minWidth: "120px",
                  padding: "12px 20px",
                  background: loading
                    ? "#ccc"
                    : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 0.3s ease",
                }}
              >
                {loading ? "Processing..." : "Predict PM2.5 (High Accuracy)"}
              </button>

              <button
                onClick={fetchOpenAQData}
                disabled={loading}
                style={{
                  flex: 1,
                  minWidth: "120px",
                  padding: "12px 20px",
                  background: loading ? "#ccc" : "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 0.3s ease",
                }}
              >
                Fetch Validated Data
              </button>
            </div>

            {error && (
              <div
                style={{
                  marginTop: "15px",
                  padding: "12px",
                  background: "#fee",
                  border: "1px solid #fcc",
                  borderRadius: "8px",
                  color: "#c33",
                  fontSize: "14px",
                }}
              >
                <strong>Error:</strong> {error}
              </div>
            )}
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
              High-Precision Results
            </h2>

            {prediction ? (
              <div>
                <div
                  style={{
                    background: `linear-gradient(135deg, ${
                      getAQIInfo(prediction.pm25_value).color
                    }20, ${getAQIInfo(prediction.pm25_value).color}10)`,
                    border: `2px solid ${
                      getAQIInfo(prediction.pm25_value).color
                    }`,
                    borderRadius: "12px",
                    padding: "20px",
                    marginBottom: "20px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "3rem",
                      fontWeight: "bold",
                      color: getAQIInfo(prediction.pm25_value).color,
                    }}
                  >
                    {prediction.pm25_value}
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#666",
                      marginBottom: "5px",
                    }}
                  >
                    μg/m³ PM2.5
                  </div>
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: "600",
                      color: getAQIInfo(prediction.pm25_value).color,
                    }}
                  >
                    {getAQIInfo(prediction.pm25_value).category}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginTop: "5px",
                      fontStyle: "italic",
                    }}
                  >
                    {getAQIInfo(prediction.pm25_value).description}
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <h3
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: "600",
                      marginBottom: "10px",
                      color: "#555",
                    }}
                  >
                    Accuracy Metrics
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                      fontSize: "14px",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px",
                        background: "#f8f9fa",
                        borderRadius: "6px",
                      }}
                    >
                      <strong>Confidence:</strong>{" "}
                      {Math.round(prediction.confidence * 100)}%
                    </div>
                    <div
                      style={{
                        padding: "8px",
                        background: "#f8f9fa",
                        borderRadius: "6px",
                      }}
                    >
                      <strong>Model:</strong> {prediction.model_version}
                    </div>
                    {prediction.statistics && (
                      <>
                        <div
                          style={{
                            padding: "8px",
                            background: "#f8f9fa",
                            borderRadius: "6px",
                          }}
                        >
                          <strong>Std Dev:</strong> ±
                          {prediction.statistics.std_deviation}
                        </div>
                        <div
                          style={{
                            padding: "8px",
                            background: "#f8f9fa",
                            borderRadius: "6px",
                          }}
                        >
                          <strong>Predictions:</strong>{" "}
                          {prediction.statistics.predictions_used}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {dataStats && dataStats.model_performance && (
                  <div style={{ marginBottom: "15px" }}>
                    <h4
                      style={{
                        fontSize: "1rem",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      Model Performance
                    </h4>
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      <div>
                        Data Quality:{" "}
                        {Math.round(
                          dataStats.model_performance.data_quality_score * 100
                        )}
                        %
                      </div>
                      <div>
                        Stability:{" "}
                        {Math.round(
                          dataStats.model_performance.prediction_stability * 100
                        )}
                        %
                      </div>
                      <div>
                        Coverage:{" "}
                        {Math.round(
                          dataStats.model_performance.spatial_coverage * 100
                        )}
                        %
                      </div>
                      <div>Training Samples: {dataStats.training_samples}</div>
                    </div>
                  </div>
                )}

                <div style={{ fontSize: "14px", color: "#666" }}>
                  <div>
                    <strong>Location:</strong> {prediction.latitude.toFixed(4)},{" "}
                    {prediction.longitude.toFixed(4)}
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  color: "#888",
                  padding: "40px 20px",
                }}
              >
                <i
                  className="fas fa-microscope"
                  style={{
                    fontSize: "3rem",
                    marginBottom: "15px",
                    opacity: 0.3,
                  }}
                ></i>
                <p>
                  Click "Predict PM2.5 (High Accuracy)" to get validated air
                  quality estimation with comprehensive accuracy metrics
                </p>
              </div>
            )}
          </div>
        </div>

        {dataStats && (
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
              Data Quality Assessment
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  window.innerWidth > 768 ? "1fr 1fr 1fr" : "1fr",
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
                  Data Statistics
                </h3>
                <div
                  style={{ fontSize: "14px", color: "#666", lineHeight: "1.6" }}
                >
                  <div>
                    Total Records:{" "}
                    {dataStats.statistics?.total_measurements || 0}
                  </div>
                  <div>
                    Real Measurements:{" "}
                    {dataStats.statistics?.real_measurements || 0}
                  </div>
                  <div>
                    Avg Distance: {dataStats.statistics?.avg_distance || 0} km
                  </div>
                  <div>
                    Avg PM2.5: {dataStats.statistics?.avg_pm25 || 0} μg/m³
                  </div>
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
                  Quality Breakdown
                </h3>
                <div
                  style={{ fontSize: "14px", color: "#666", lineHeight: "1.6" }}
                >
                  <div style={{ color: "#28a745" }}>
                    High Quality:{" "}
                    {dataStats.data_quality?.high_quality_measurements || 0}
                  </div>
                  <div style={{ color: "#ffc107" }}>
                    Medium Quality:{" "}
                    {dataStats.data_quality?.medium_quality_measurements || 0}
                  </div>
                  <div style={{ color: "#dc3545" }}>
                    Low Quality:{" "}
                    {dataStats.data_quality?.low_quality_measurements || 0}
                  </div>
                  <div>
                    Avg Quality:{" "}
                    {Math.round(
                      (dataStats.statistics?.avg_data_quality || 0) * 100
                    )}
                    %
                  </div>
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
                  Data Completeness
                </h3>
                <div
                  style={{ fontSize: "14px", color: "#666", lineHeight: "1.6" }}
                >
                  <div>
                    PM2.5: {dataStats.data_completeness?.pm25_complete || 0}
                  </div>
                  <div>
                    AOD: {dataStats.data_completeness?.aod_complete || 0}
                  </div>
                  <div>
                    NO₂: {dataStats.data_completeness?.no2_complete || 0}
                  </div>
                  <div>
                    Weather:{" "}
                    {dataStats.data_completeness?.temperature_complete || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {measurements.length > 0 && (
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
              Nearby Measurements ({measurements.length})
            </h2>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "14px",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8f9fa" }}>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid #dee2e6",
                      }}
                    >
                      Location
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid #dee2e6",
                      }}
                    >
                      PM2.5
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid #dee2e6",
                      }}
                    >
                      Quality
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid #dee2e6",
                      }}
                    >
                      Type
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid #dee2e6",
                      }}
                    >
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.slice(0, 10).map((measurement, index) => {
                    const aqiInfo = getAQIInfo(
                      parseFloat(measurement.pm25_value)
                    );
                    return (
                      <tr
                        key={measurement.id}
                        style={{ borderBottom: "1px solid #dee2e6" }}
                      >
                        <td style={{ padding: "12px" }}>
                          {parseFloat(measurement.latitude).toFixed(3)},{" "}
                          {parseFloat(measurement.longitude).toFixed(3)}
                        </td>
                        <td style={{ padding: "12px", fontWeight: "600" }}>
                          {parseFloat(measurement.pm25_value).toFixed(1)} μg/m³
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span
                            style={{
                              color: aqiInfo.color,
                              fontWeight: "600",
                              fontSize: "12px",
                            }}
                          >
                            {aqiInfo.category}
                          </span>
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: "12px",
                              fontSize: "12px",
                              background: measurement.is_prediction
                                ? "#e3f2fd"
                                : "#f3e5f5",
                              color: measurement.is_prediction
                                ? "#1976d2"
                                : "#7b1fa2",
                            }}
                          >
                            {measurement.is_prediction
                              ? "Prediction"
                              : "Measured"}
                          </span>
                        </td>
                        <td style={{ padding: "12px", color: "#666" }}>
                          {new Date(
                            measurement.measurement_date
                          ).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div
          style={{
            background: "rgba(255,255,255,0.95)",
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
            About This System
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: window.innerWidth > 768 ? "1fr 1fr" : "1fr",
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
                Data Sources
              </h3>
              <ul
                style={{ fontSize: "14px", color: "#666", lineHeight: "1.6" }}
              >
                <li>Satellite AOD data (aerosol optical depth)</li>
                <li>NO₂ measurements from Sentinel-5P</li>
                <li>Meteorological parameters</li>
                <li>Ground-level PM2.5 from OpenAQ</li>
              </ul>
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
                Model Features
              </h3>
              <ul
                style={{ fontSize: "14px", color: "#666", lineHeight: "1.6" }}
              >
                <li>Random Forest ensemble learning</li>
                <li>Spatial and temporal feature engineering</li>
                <li>Multi-source data fusion</li>
                <li>Real-time prediction capability</li>
              </ul>
            </div>
          </div>

          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              background: "#f8f9fa",
              borderRadius: "8px",
              fontSize: "14px",
              color: "#666",
            }}
          >
            <strong>Note:</strong> This system provides estimated PM2.5 values
            for areas without dense ground monitoring. Predictions are based on
            machine learning models trained on multi-source environmental data
            and should be used as supplementary information alongside official
            air quality monitoring networks.
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default MainComponent;