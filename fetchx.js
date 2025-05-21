class FetchX {
  constructor() {
    this.xhr = new XMLHttpRequest();
    this.headers = {
      Accept: "application/json, text/html",
      "X-Requested-With": "XMLHttpRequest",
    };
    this.timeout = 0; // 0 means no timeout
    this.responseType = ""; // 'json', 'text', 'blob', 'arraybuffer', 'document'
  }

  // Set request headers
  header(key, value) {
    this.headers[key] = value;
    return this;
  }

  // Set timeout in milliseconds
  timeout(ms) {
    this.timeout = ms;
    return this;
  }

  // Set expected response type
  responseType(type) {
    this.responseType = type;
    return this;
  }

  // Abort current request
  abort() {
    if (this.xhr) this.xhr.abort();
    return this;
  }

  // Handle response
  _handleResponse(resolve, reject) {
    this.xhr.onload = () => {
      if (this.xhr.status >= 200 && this.xhr.status < 300) {
        let responseData;

        if (
          this.responseType === "json" ||
          this.xhr
            .getResponseHeader("Content-Type")
            ?.includes("application/json")
        ) {
          try {
            responseData = JSON.parse(this.xhr.responseText);
          } catch (e) {
            responseData = this.xhr.responseText;
          }
        } else if (this.responseType === "blob") {
          responseData = this.xhr.response;
        } else if (this.responseType === "document") {
          responseData = this.xhr.responseXML;
        } else {
          responseData = this.xhr.responseText;
        }

        resolve({
          data: responseData,
          status: this.xhr.status,
          statusText: this.xhr.statusText,
          xhr: this.xhr,
        });
      } else {
        reject(this._createError());
      }
    };

    this.xhr.onerror = () => reject(this._createError());
    this.xhr.ontimeout = () =>
      reject({ status: 0, statusText: "Request timeout" });

    if (this.timeout > 0) this.xhr.timeout = this.timeout;
  }

  // Create error object
  _createError() {
    return {
      status: this.xhr.status || 0,
      statusText: this.xhr.statusText || "Network Error",
      response: this.xhr.responseText,
    };
  }

  // Prepare request
  _prepareRequest(method, url) {
    this.xhr = new XMLHttpRequest();
    this.xhr.open(method, url, true);
    if (this.responseType) this.xhr.responseType = this.responseType;
    for (const [key, value] of Object.entries(this.headers)) {
      this.xhr.setRequestHeader(key, value);
    }
  }

  // Send data with proper content type
  _sendData(data) {
    if (!this.headers["Content-Type"] && !(data instanceof FormData)) {
      this.xhr.setRequestHeader("Content-Type", "application/json");
      data = JSON.stringify(data);
    }
    this.xhr.send(data);
  }

  // GET request
  async get(url, params = null) {
    let query = params ? "?" + new URLSearchParams(params).toString() : "";
    this._prepareRequest("GET", url + query);
    return await this._executeRequest();
  }

  // POST request
  async post(url, data = {}) {
    this._prepareRequest("POST", url);
    return await this._executeRequest(data);
  }

  // PUT request
  async put(url, data = {}) {
    this._prepareRequest("PUT", url);
    return await this._executeRequest(data);
  }

  // DELETE request
  async delete(url, data = null) {
    this._prepareRequest("DELETE", url);
    return await this._executeRequest(data);
  }

  // PATCH request
  async patch(url, data = {}) {
    this._prepareRequest("PATCH", url);
    return await this._executeRequest(data);
  }

  // Unified request execution
  _executeRequest(data = null) {
    return new Promise((resolve, reject) => {
      this._handleResponse(resolve, reject);
      if (data !== null) {
        this._sendData(data);
      } else {
        this.xhr.send();
      }
    });
  }

  // File upload with progress
  async upload(url, formData, onProgress = null) {
    this._prepareRequest("POST", url);
    
    return new Promise((resolve, reject) => {
      if (onProgress) {
        this.xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            onProgress(Math.round((e.loaded / e.total) * 100), e);
        };
      }
      this._handleResponse(resolve, reject);
      this.xhr.send(formData);
    });
  }

  // Static helper methods
  static async get(url, params = null) {
    return await new FetchX().get(url, params);
  }

  static async post(url, data = {}) {
    return await new FetchX().post(url, data);
  }

  static async put(url, data = {}) {
    return await new FetchX().put(url, data);
  }

  static async delete(url, data = null) {
    return await new FetchX().delete(url, data);
  }

  static async patch(url, data = {}) {
    return await new FetchX().patch(url, data);
  }
}

// Global helper function
function fetchx() {
  return new FetchX();
}

// ES module exports
export default fetchx;
export { FetchX };