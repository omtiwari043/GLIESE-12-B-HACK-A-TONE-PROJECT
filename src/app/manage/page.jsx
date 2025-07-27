"use client";
import React from "react";

function MainComponent() {
  const [measurements, setMeasurements] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [success, setSuccess] = React.useState(null);
  const [selectedMeasurements, setSelectedMeasurements] = React.useState([]);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [editingMeasurement, setEditingMeasurement] = React.useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage] = React.useState(20);
  const [totalItems, setTotalItems] = React.useState(0);

  const [filters, setFilters] = React.useState({
    latitude: "",
    longitude: "",
    radius: 50,
    startDate: "",
    endDate: "",
    minPM25: "",
    maxPM25: "",
    dataSource: "",
    isPrediction: "",
    searchText: "",
  });

  const [formData, setFormData] = React.useState({
    latitude: "",
    longitude: "",
    pm25_value: "",
    aod_value: "",
    no2_value: "",
    temperature: "",
    humidity: "",
    wind_speed: "",
    data_source: "manual",
    is_prediction: false,
    model_version: "",
    prediction_accuracy: "",
    validation_status: "pending",
  });

  const [formErrors, setFormErrors] = React.useState({});

  const validateForm = React.useCallback((data) => {
    const errors = {};

    if (!data.latitude || isNaN(parseFloat(data.latitude))) {
      errors.latitude = "Valid latitude is required";
    } else {
      const lat = parseFloat(data.latitude);
      if (lat < -90 || lat > 90) {
        errors.latitude = "Latitude must be between -90 and 90";
      }
    }

    if (!data.longitude || isNaN(parseFloat(data.longitude))) {
      errors.longitude = "Valid longitude is required";
    } else {
      const lng = parseFloat(data.longitude);
      if (lng < -180 || lng > 180) {
        errors.longitude = "Longitude must be between -180 and 180";
      }
    }

    if (!data.pm25_value || isNaN(parseFloat(data.pm25_value))) {
      errors.pm25_value = "Valid PM2.5 value is required";
    } else {
      const pm25 = parseFloat(data.pm25_value);
      if (pm25 < 0 || pm25 > 500) {
        errors.pm25_value = "PM2.5 must be between 0 and 500 μg/m³";
      }
    }

    if (data.aod_value && !isNaN(parseFloat(data.aod_value))) {
      const aod = parseFloat(data.aod_value);
      if (aod < 0 || aod > 5) {
        errors.aod_value = "AOD must be between 0 and 5";
      }
    }

    if (data.no2_value && !isNaN(parseFloat(data.no2_value))) {
      const no2 = parseFloat(data.no2_value);
      if (no2 < 0 || no2 > 0.001) {
        errors.no2_value = "NO₂ must be between 0 and 0.001";
      }
    }

    if (data.temperature && !isNaN(parseFloat(data.temperature))) {
      const temp = parseFloat(data.temperature);
      if (temp < -50 || temp > 60) {
        errors.temperature = "Temperature must be between -50°C and 60°C";
      }
    }

    if (data.humidity && !isNaN(parseFloat(data.humidity))) {
      const hum = parseFloat(data.humidity);
      if (hum < 0 || hum > 100) {
        errors.humidity = "Humidity must be between 0% and 100%";
      }
    }

    if (data.wind_speed && !isNaN(parseFloat(data.wind_speed))) {
      const wind = parseFloat(data.wind_speed);
      if (wind < 0 || wind > 50) {
        errors.wind_speed = "Wind speed must be between 0 and 50 m/s";
      }
    }

    if (
      data.prediction_accuracy &&
      !isNaN(parseFloat(data.prediction_accuracy))
    ) {
      const acc = parseFloat(data.prediction_accuracy);
      if (acc < 0 || acc > 1) {
        errors.prediction_accuracy =
          "Prediction accuracy must be between 0 and 1";
      }
    }

    return errors;
  }, []);

  const fetchMeasurements = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const searchParams = {
        includePredictions: true,
        radius: filters.radius || 50,
      };

      if (filters.latitude && filters.longitude) {
        searchParams.latitude = parseFloat(filters.latitude);
        searchParams.longitude = parseFloat(filters.longitude);
      } else {
        searchParams.latitude = 40.7128;
        searchParams.longitude = -74.006;
      }

      if (filters.startDate) searchParams.startDate = filters.startDate;
      if (filters.endDate) searchParams.endDate = filters.endDate;

      const response = await fetch("/api/get-pm25-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchParams),
      });

      if (!response.ok) throw new Error("Failed to fetch measurements");

      const data = await response.json();
      if (data.success) {
        let filteredData = data.data || [];

        if (filters.minPM25) {
          filteredData = filteredData.filter(
            (m) => parseFloat(m.pm25_value) >= parseFloat(filters.minPM25)
          );
        }
        if (filters.maxPM25) {
          filteredData = filteredData.filter(
            (m) => parseFloat(m.pm25_value) <= parseFloat(filters.maxPM25)
          );
        }
        if (filters.dataSource) {
          filteredData = filteredData.filter(
            (m) => m.data_source === filters.dataSource
          );
        }
        if (filters.isPrediction !== "") {
          filteredData = filteredData.filter(
            (m) => m.is_prediction === (filters.isPrediction === "true")
          );
        }
        if (filters.searchText) {
          const searchLower = filters.searchText.toLowerCase();
          filteredData = filteredData.filter(
            (m) =>
              m.data_source.toLowerCase().includes(searchLower) ||
              (m.model_version &&
                m.model_version.toLowerCase().includes(searchLower)) ||
              m.id.toString().includes(searchLower)
          );
        }

        setTotalItems(filteredData.length);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedData = filteredData.slice(
          startIndex,
          startIndex + itemsPerPage
        );
        setMeasurements(paginatedData);
      } else {
        setError(data.error || "Failed to fetch measurements");
      }
    } catch (err) {
      console.error("Error fetching measurements:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, itemsPerPage]);

  const createMeasurement = React.useCallback(
    async (data) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/create-measurement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) throw new Error("Failed to create measurement");

        const result = await response.json();
        if (result.success) {
          setSuccess("Measurement created successfully");
          setShowCreateForm(false);
          setFormData({
            latitude: "",
            longitude: "",
            pm25_value: "",
            aod_value: "",
            no2_value: "",
            temperature: "",
            humidity: "",
            wind_speed: "",
            data_source: "manual",
            is_prediction: false,
            model_version: "",
            prediction_accuracy: "",
            validation_status: "pending",
          });
          fetchMeasurements();
        } else {
          setError(result.error || "Failed to create measurement");
        }
      } catch (err) {
        console.error("Error creating measurement:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [fetchMeasurements]
  );

  const updateMeasurement = React.useCallback(
    async (id, data) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/update-measurement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...data }),
        });

        if (!response.ok) throw new Error("Failed to update measurement");

        const result = await response.json();
        if (result.success) {
          setSuccess("Measurement updated successfully");
          setEditingMeasurement(null);
          fetchMeasurements();
        } else {
          setError(result.error || "Failed to update measurement");
        }
      } catch (err) {
        console.error("Error updating measurement:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [fetchMeasurements]
  );

  const handleSubmit = React.useCallback(
    async (e) => {
      e.preventDefault();
      const errors = validateForm(formData);
      setFormErrors(errors);

      if (Object.keys(errors).length === 0) {
        if (editingMeasurement) {
          await updateMeasurement(editingMeasurement.id, formData);
        } else {
          await createMeasurement(formData);
        }
      }
    },
    [
      formData,
      validateForm,
      editingMeasurement,
      createMeasurement,
      updateMeasurement,
    ]
  );

  const handleEdit = React.useCallback((measurement) => {
    setEditingMeasurement(measurement);
    setFormData({
      latitude: measurement.latitude?.toString() || "",
      longitude: measurement.longitude?.toString() || "",
      pm25_value: measurement.pm25_value?.toString() || "",
      aod_value: measurement.aod_value?.toString() || "",
      no2_value: measurement.no2_value?.toString() || "",
      temperature: measurement.temperature?.toString() || "",
      humidity: measurement.humidity?.toString() || "",
      wind_speed: measurement.wind_speed?.toString() || "",
      data_source: measurement.data_source || "manual",
      is_prediction: measurement.is_prediction || false,
      model_version: measurement.model_version || "",
      prediction_accuracy: measurement.prediction_accuracy?.toString() || "",
      validation_status: measurement.validation_status || "pending",
    });
    setShowCreateForm(true);
  }, []);

  const handleBulkDelete = React.useCallback(async () => {
    if (selectedMeasurements.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const id of selectedMeasurements) {
        try {
          const response = await fetch("/api/update-measurement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, validation_status: "deleted" }),
          });

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch {
          errorCount++;
        }
      }

      if (successCount > 0) {
        setSuccess(
          `Successfully marked ${successCount} measurements as deleted`
        );
        setSelectedMeasurements([]);
        fetchMeasurements();
      }

      if (errorCount > 0) {
        setError(`Failed to delete ${errorCount} measurements`);
      }
    } catch (err) {
      setError("Bulk delete operation failed");
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  }, [selectedMeasurements, fetchMeasurements]);

  const getAQIInfo = React.useCallback((pm25Value) => {
    if (pm25Value <= 12) return { category: "Good", color: "#00e400" };
    if (pm25Value <= 35.4) return { category: "Moderate", color: "#00BFFF" };
    if (pm25Value <= 55.4)
      return { category: "Unhealthy for Sensitive", color: "#FF6600" };
    if (pm25Value <= 150.4) return { category: "Unhealthy", color: "#FF0000" };
    if (pm25Value <= 250.4)
      return { category: "Very Unhealthy", color: "#9932CC" };
    return { category: "Hazardous", color: "#8B0000" };
  }, []);

  React.useEffect(() => {
    fetchMeasurements();
  }, [fetchMeasurements]);

  React.useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);

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
            PM2.5 Data Management
          </h1>
          <p
            style={{
              fontSize: "1.1rem",
              opacity: 0.9,
              maxWidth: "700px",
              margin: "0 auto",
            }}
          >
            Create, edit, search, and manage PM2.5 measurements with
            comprehensive validation and bulk operations
          </p>
        </div>

        {(success || error) && (
          <div
            style={{
              position: "fixed",
              top: "20px",
              right: "20px",
              zIndex: 1000,
              padding: "15px 20px",
              borderRadius: "8px",
              color: "white",
              fontWeight: "600",
              background: success ? "#28a745" : "#dc3545",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            <i
              className={`fas ${
                success ? "fa-check-circle" : "fa-exclamation-triangle"
              }`}
              style={{ marginRight: "8px" }}
            ></i>
            {success || error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: window.innerWidth > 1200 ? "350px 1fr" : "1fr",
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
              height: "fit-content",
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
              Search & Filter
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
                Search Text
              </label>
              <input
                type="text"
                value={filters.searchText}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    searchText: e.target.value,
                  }))
                }
                placeholder="Search by ID, source, model..."
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e1e5e9",
                  borderRadius: "8px",
                  fontSize: "14px",
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "15px",
                marginBottom: "20px",
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
                  Center Latitude
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={filters.latitude}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      latitude: e.target.value,
                    }))
                  }
                  placeholder="40.7128"
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
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
                  Center Longitude
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={filters.longitude}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      longitude: e.target.value,
                    }))
                  }
                  placeholder="-74.006"
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  marginBottom: "5px",
                  color: "#666",
                }}
              >
                Search Radius (km)
              </label>
              <input
                type="number"
                value={filters.radius}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    radius: parseInt(e.target.value) || 50,
                  }))
                }
                min="1"
                max="1000"
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "15px",
                marginBottom: "20px",
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
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
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
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "15px",
                marginBottom: "20px",
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
                  Min PM2.5
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={filters.minPM25}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, minPM25: e.target.value }))
                  }
                  placeholder="0"
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
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
                  Max PM2.5
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={filters.maxPM25}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, maxPM25: e.target.value }))
                  }
                  placeholder="500"
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  marginBottom: "5px",
                  color: "#666",
                }}
              >
                Data Source
              </label>
              <select
                value={filters.dataSource}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    dataSource: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              >
                <option value="">All Sources</option>
                <option value="manual">Manual</option>
                <option value="openaq">OpenAQ</option>
                <option value="synthetic">Synthetic</option>
                <option value="ml_prediction">ML Prediction</option>
              </select>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  marginBottom: "5px",
                  color: "#666",
                }}
              >
                Type
              </label>
              <select
                value={filters.isPrediction}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    isPrediction: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              >
                <option value="">All Types</option>
                <option value="false">Measurements</option>
                <option value="true">Predictions</option>
              </select>
            </div>

            <button
              onClick={fetchMeasurements}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                background: loading
                  ? "#ccc"
                  : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Searching..." : "Apply Filters"}
            </button>
          </div>

          <div
            style={{
              background: "white",
              borderRadius: "15px",
              padding: "25px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  color: "#333",
                  margin: 0,
                }}
              >
                Measurements ({totalItems})
              </h2>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {selectedMeasurements.length > 0 && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      padding: "10px 15px",
                      background: "#dc3545",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <i className="fas fa-trash"></i>
                    Delete Selected ({selectedMeasurements.length})
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowCreateForm(true);
                    setEditingMeasurement(null);
                    setFormData({
                      latitude: "",
                      longitude: "",
                      pm25_value: "",
                      aod_value: "",
                      no2_value: "",
                      temperature: "",
                      humidity: "",
                      wind_speed: "",
                      data_source: "manual",
                      is_prediction: false,
                      model_version: "",
                      prediction_accuracy: "",
                      validation_status: "pending",
                    });
                  }}
                  style={{
                    padding: "10px 15px",
                    background: "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <i className="fas fa-plus"></i>
                  Add New
                </button>
              </div>
            </div>

            {loading && (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px",
                  color: "#666",
                }}
              >
                <i
                  className="fas fa-spinner fa-spin"
                  style={{ fontSize: "2rem", marginBottom: "10px" }}
                ></i>
                <p>Loading measurements...</p>
              </div>
            )}

            {!loading && measurements.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px",
                  color: "#888",
                }}
              >
                <i
                  className="fas fa-database"
                  style={{
                    fontSize: "3rem",
                    marginBottom: "15px",
                    opacity: 0.3,
                  }}
                ></i>
                <p>No measurements found matching your criteria</p>
              </div>
            )}

            {!loading && measurements.length > 0 && (
              <>
                <div style={{ overflowX: "auto", marginBottom: "20px" }}>
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
                          <input
                            type="checkbox"
                            checked={
                              selectedMeasurements.length ===
                              measurements.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMeasurements(
                                  measurements.map((m) => m.id)
                                );
                              } else {
                                setSelectedMeasurements([]);
                              }
                            }}
                          />
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            borderBottom: "2px solid #dee2e6",
                          }}
                        >
                          ID
                        </th>
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
                          Type
                        </th>
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            borderBottom: "2px solid #dee2e6",
                          }}
                        >
                          Source
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
                        <th
                          style={{
                            padding: "12px",
                            textAlign: "left",
                            borderBottom: "2px solid #dee2e6",
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurements.map((measurement) => {
                        const aqiInfo = getAQIInfo(
                          parseFloat(measurement.pm25_value)
                        );
                        return (
                          <tr
                            key={measurement.id}
                            style={{ borderBottom: "1px solid #dee2e6" }}
                          >
                            <td style={{ padding: "12px" }}>
                              <input
                                type="checkbox"
                                checked={selectedMeasurements.includes(
                                  measurement.id
                                )}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedMeasurements((prev) => [
                                      ...prev,
                                      measurement.id,
                                    ]);
                                  } else {
                                    setSelectedMeasurements((prev) =>
                                      prev.filter((id) => id !== measurement.id)
                                    );
                                  }
                                }}
                              />
                            </td>
                            <td style={{ padding: "12px", fontWeight: "600" }}>
                              #{measurement.id}
                            </td>
                            <td style={{ padding: "12px" }}>
                              {parseFloat(measurement.latitude).toFixed(4)},{" "}
                              {parseFloat(measurement.longitude).toFixed(4)}
                            </td>
                            <td style={{ padding: "12px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: "600",
                                    color: aqiInfo.color,
                                  }}
                                >
                                  {parseFloat(measurement.pm25_value).toFixed(
                                    1
                                  )}
                                </span>
                                <span
                                  style={{ fontSize: "12px", color: "#666" }}
                                >
                                  μg/m³
                                </span>
                              </div>
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
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "12px",
                                color: "#666",
                              }}
                            >
                              {measurement.data_source}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "12px",
                                color: "#666",
                              }}
                            >
                              {new Date(
                                measurement.measurement_date
                              ).toLocaleDateString()}
                            </td>
                            <td style={{ padding: "12px" }}>
                              <div style={{ display: "flex", gap: "5px" }}>
                                <button
                                  onClick={() => handleEdit(measurement)}
                                  style={{
                                    padding: "6px 10px",
                                    background: "#007bff",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button
                                  onClick={() => {
                                    setDeleteTarget(measurement);
                                    setShowDeleteConfirm(true);
                                  }}
                                  style={{
                                    padding: "6px 10px",
                                    background: "#dc3545",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    cursor: "pointer",
                                  }}
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: "10px",
                      marginTop: "20px",
                    }}
                  >
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                      style={{
                        padding: "8px 12px",
                        background: currentPage === 1 ? "#ccc" : "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: currentPage === 1 ? "not-allowed" : "pointer",
                      }}
                    >
                      <i className="fas fa-chevron-left"></i>
                    </button>

                    <span style={{ color: "#666", fontSize: "14px" }}>
                      Page {currentPage} of {totalPages}
                    </span>

                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                      style={{
                        padding: "8px 12px",
                        background:
                          currentPage === totalPages ? "#ccc" : "#007bff",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor:
                          currentPage === totalPages
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      <i className="fas fa-chevron-right"></i>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {showCreateForm && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px",
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: "15px",
                padding: "30px",
                maxWidth: "800px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "25px",
                }}
              >
                <h2
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: "bold",
                    color: "#333",
                    margin: 0,
                  }}
                >
                  {editingMeasurement
                    ? "Edit Measurement"
                    : "Create New Measurement"}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingMeasurement(null);
                    setFormErrors({});
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "24px",
                    color: "#666",
                    cursor: "pointer",
                  }}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      window.innerWidth > 600 ? "1fr 1fr" : "1fr",
                    gap: "20px",
                    marginBottom: "25px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      Latitude *
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      name="latitude"
                      value={formData.latitude}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          latitude: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: formErrors.latitude
                          ? "2px solid #dc3545"
                          : "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      placeholder="-90 to 90"
                    />
                    {formErrors.latitude && (
                      <div
                        style={{
                          color: "#dc3545",
                          fontSize: "12px",
                          marginTop: "5px",
                        }}
                      >
                        {formErrors.latitude}
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      Longitude *
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      name="longitude"
                      value={formData.longitude}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          longitude: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: formErrors.longitude
                          ? "2px solid #dc3545"
                          : "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      placeholder="-180 to 180"
                    />
                    {formErrors.longitude && (
                      <div
                        style={{
                          color: "#dc3545",
                          fontSize: "12px",
                          marginTop: "5px",
                        }}
                      >
                        {formErrors.longitude}
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      PM2.5 Value (μg/m³) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      name="pm25_value"
                      value={formData.pm25_value}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          pm25_value: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: formErrors.pm25_value
                          ? "2px solid #dc3545"
                          : "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      placeholder="0 to 500"
                    />
                    {formErrors.pm25_value && (
                      <div
                        style={{
                          color: "#dc3545",
                          fontSize: "12px",
                          marginTop: "5px",
                        }}
                      >
                        {formErrors.pm25_value}
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      AOD Value
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      name="aod_value"
                      value={formData.aod_value}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          aod_value: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: formErrors.aod_value
                          ? "2px solid #dc3545"
                          : "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      placeholder="0 to 5"
                    />
                    {formErrors.aod_value && (
                      <div
                        style={{
                          color: "#dc3545",
                          fontSize: "12px",
                          marginTop: "5px",
                        }}
                      >
                        {formErrors.aod_value}
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      NO₂ Value (mol/m²)
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      name="no2_value"
                      value={formData.no2_value}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          no2_value: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: formErrors.no2_value
                          ? "2px solid #dc3545"
                          : "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      placeholder="0 to 0.001"
                    />
                    {formErrors.no2_value && (
                      <div
                        style={{
                          color: "#dc3545",
                          fontSize: "12px",
                          marginTop: "5px",
                        }}
                      >
                        {formErrors.no2_value}
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      Temperature (°C)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      name="temperature"
                      value={formData.temperature}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          temperature: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: formErrors.temperature
                          ? "2px solid #dc3545"
                          : "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      placeholder="-50 to 60"
                    />
                    {formErrors.temperature && (
                      <div
                        style={{
                          color: "#dc3545",
                          fontSize: "12px",
                          marginTop: "5px",
                        }}
                      >
                        {formErrors.temperature}
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      Humidity (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      name="humidity"
                      value={formData.humidity}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          humidity: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: formErrors.humidity
                          ? "2px solid #dc3545"
                          : "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      placeholder="0 to 100"
                    />
                    {formErrors.humidity && (
                      <div
                        style={{
                          color: "#dc3545",
                          fontSize: "12px",
                          marginTop: "5px",
                        }}
                      >
                        {formErrors.humidity}
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      Wind Speed (m/s)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      name="wind_speed"
                      value={formData.wind_speed}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          wind_speed: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: formErrors.wind_speed
                          ? "2px solid #dc3545"
                          : "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                      placeholder="0 to 50"
                    />
                    {formErrors.wind_speed && (
                      <div
                        style={{
                          color: "#dc3545",
                          fontSize: "12px",
                          marginTop: "5px",
                        }}
                      >
                        {formErrors.wind_speed}
                      </div>
                    )}
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      Data Source
                    </label>
                    <select
                      name="data_source"
                      value={formData.data_source}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          data_source: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                    >
                      <option value="manual">Manual</option>
                      <option value="openaq">OpenAQ</option>
                      <option value="synthetic">Synthetic</option>
                      <option value="ml_prediction">ML Prediction</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "600",
                        marginBottom: "8px",
                        color: "#555",
                      }}
                    >
                      Validation Status
                    </label>
                    <select
                      name="validation_status"
                      value={formData.validation_status}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          validation_status: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "10px",
                        border: "2px solid #e1e5e9",
                        borderRadius: "8px",
                        fontSize: "14px",
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="validated">Validated</option>
                      <option value="rejected">Rejected</option>
                      <option value="deleted">Deleted</option>
                    </select>
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontWeight: "600",
                        color: "#555",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        name="is_prediction"
                        checked={formData.is_prediction}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            is_prediction: e.target.checked,
                          }))
                        }
                      />
                      This is a prediction (not a measured value)
                    </label>
                  </div>

                  {formData.is_prediction && (
                    <>
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontWeight: "600",
                            marginBottom: "8px",
                            color: "#555",
                          }}
                        >
                          Model Version
                        </label>
                        <input
                          type="text"
                          name="model_version"
                          value={formData.model_version}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              model_version: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "10px",
                            border: "2px solid #e1e5e9",
                            borderRadius: "8px",
                            fontSize: "14px",
                          }}
                          placeholder="e.g., enhanced_rf_v2.0"
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontWeight: "600",
                            marginBottom: "8px",
                            color: "#555",
                          }}
                        >
                          Prediction Accuracy (0-1)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          name="prediction_accuracy"
                          value={formData.prediction_accuracy}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              prediction_accuracy: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            padding: "10px",
                            border: formErrors.prediction_accuracy
                              ? "2px solid #dc3545"
                              : "2px solid #e1e5e9",
                            borderRadius: "8px",
                            fontSize: "14px",
                          }}
                          placeholder="0.0 to 1.0"
                        />
                        {formErrors.prediction_accuracy && (
                          <div
                            style={{
                              color: "#dc3545",
                              fontSize: "12px",
                              marginTop: "5px",
                            }}
                          >
                            {formErrors.prediction_accuracy}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "10px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setEditingMeasurement(null);
                      setFormErrors({});
                    }}
                    style={{
                      padding: "12px 20px",
                      background: "#6c757d",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
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
                    }}
                  >
                    {loading
                      ? "Saving..."
                      : editingMeasurement
                      ? "Update Measurement"
                      : "Create Measurement"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: "15px",
                padding: "30px",
                maxWidth: "500px",
                width: "90%",
              }}
            >
              <h3
                style={{
                  fontSize: "1.3rem",
                  fontWeight: "bold",
                  color: "#333",
                  marginBottom: "15px",
                }}
              >
                Confirm Deletion
              </h3>

              <p style={{ color: "#666", marginBottom: "25px" }}>
                {deleteTarget
                  ? `Are you sure you want to delete measurement #${deleteTarget.id}?`
                  : `Are you sure you want to delete ${selectedMeasurements.length} selected measurements?`}
                <br />
                <strong>This action cannot be undone.</strong>
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteTarget(null);
                  }}
                  style={{
                    padding: "10px 20px",
                    background: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={
                    deleteTarget
                      ? () => {
                          setSelectedMeasurements([deleteTarget.id]);
                          handleBulkDelete();
                          setDeleteTarget(null);
                        }
                      : handleBulkDelete
                  }
                  disabled={loading}
                  style={{
                    padding: "10px 20px",
                    background: loading ? "#ccc" : "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MainComponent;