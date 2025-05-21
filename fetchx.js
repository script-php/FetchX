class FetchX {
  constructor() {
    this.xhr = null;
    this.headers = {
      Accept: "application/json, text/html",
      "X-Requested-With": "XMLHttpRequest",
    };
    this._timeout = 0; // 0 means no timeout
    this._responseType = ""; // 'json', 'text', 'blob', 'arraybuffer', 'document'
    this.aborted = false;
  }

  // Set request headers (chain-friendly)
  header(key, value) {
    if (typeof key === 'object') {
      // Support object of headers: .header({ 'Content-Type': 'application/json', 'Authorization': 'Bearer token' })
      Object.assign(this.headers, key);
    } else {
      this.headers[key] = value;
    }
    return this;
  }

  // Set timeout in milliseconds
  timeout(ms) {
    this._timeout = Math.max(0, parseInt(ms) || 0);
    return this;
  }

  // Set expected response type
  responseType(type) {
    const validTypes = ['', 'json', 'text', 'blob', 'arraybuffer', 'document'];
    this._responseType = validTypes.includes(type) ? type : '';
    return this;
  }

  // Set base URL for all requests
  baseURL(url) {
    this._baseURL = url.replace(/\/$/, ''); // Remove trailing slash
    return this;
  }

  // Add request interceptor
  interceptRequest(fn) {
    this._requestInterceptor = fn;
    return this;
  }

  // Add response interceptor
  interceptResponse(fn) {
    this._responseInterceptor = fn;
    return this;
  }

  // Abort current request
  abort() {
    this.aborted = true;
    if (this.xhr) {
      this.xhr.abort();
    }
    return this;
  }

  // Handle response with better error handling and interceptors
  _handleResponse(resolve, reject) {
    this.xhr.onload = () => {
      if (this.aborted) return;

      let responseData;
      const contentType = this.xhr.getResponseHeader("Content-Type") || '';
      
      try {
        // Handle different response types correctly
        if (this._responseType === 'json') {
          // When responseType is 'json', use xhr.response (browser handles JSON parsing)
          responseData = this.xhr.response;
        } else if (this._responseType === 'blob') {
          responseData = this.xhr.response;
        } else if (this._responseType === 'document') {
          responseData = this.xhr.responseXML || this.xhr.response;
        } else if (this._responseType === 'arraybuffer') {
          responseData = this.xhr.response;
        } else {
          // For '' or 'text' responseType, we can use responseText
          const rawText = this.xhr.responseText;
          
          // Auto-detect JSON and parse if no specific responseType is set
          if (this._responseType === '' && contentType.includes('application/json') && rawText) {
            try {
              responseData = JSON.parse(rawText);
            } catch (parseError) {
              responseData = rawText; // Fallback to raw text if JSON parsing fails
            }
          } else {
            responseData = rawText;
          }
        }
      } catch (e) {
        // Final fallback - try to get any available response data
        responseData = this.xhr.response || this.xhr.responseText || null;
      }

      const response = {
        data: responseData,
        status: this.xhr.status,
        statusText: this.xhr.statusText,
        headers: this._parseResponseHeaders(this.xhr.getAllResponseHeaders()),
        config: {
          url: this.xhr.responseURL || '',
          method: this._currentMethod,
          headers: { ...this.headers }
        },
        xhr: this.xhr,
      };

      if (this.xhr.status >= 200 && this.xhr.status < 300) {
        // Apply response interceptor if exists
        const finalResponse = this._responseInterceptor ? this._responseInterceptor(response) : response;
        resolve(finalResponse);
      } else {
        const error = this._createError(response);
        reject(error);
      }
    };

    this.xhr.onerror = () => {
      if (!this.aborted) {
        reject(this._createError());
      }
    };

    this.xhr.ontimeout = () => {
      if (!this.aborted) {
        reject(this._createError(null, 'Request timeout'));
      }
    };

    this.xhr.onabort = () => {
      if (this.aborted) {
        reject(this._createError(null, 'Request aborted'));
      }
    };

    if (this._timeout > 0) {
      this.xhr.timeout = this._timeout;
    }
  }

  // Parse response headers into object
  _parseResponseHeaders(headerStr) {
    const headers = {};
    if (!headerStr) return headers;
    
    headerStr.split('\r\n').forEach(line => {
      const [key, ...valueParts] = line.split(': ');
      if (key && valueParts.length) {
        headers[key.toLowerCase()] = valueParts.join(': ');
      }
    });
    return headers;
  }

  // Create enhanced error object
  _createError(response = null, message = null) {
    const error = new Error(message || 'Network Error');
    error.isNetworkError = true;
    error.status = response?.status || this.xhr?.status || 0;
    error.statusText = response?.statusText || this.xhr?.statusText || message || 'Network Error';
    error.response = response;
    return error;
  }

  // Build complete URL
  _buildURL(url) {
    if (!url) throw new Error('URL is required');
    
    // Return as-is if already absolute URL
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return url;
    }
    
    // Prepend base URL if available
    if (this._baseURL) {
      return `${this._baseURL}/${url.replace(/^\//, '')}`;
    }
    
    return url;
  }

  // Prepare request with better error handling
  _prepareRequest(method, url) {
    this.aborted = false;
    this._currentMethod = method.toUpperCase();
    
    const fullURL = this._buildURL(url);
    
    this.xhr = new XMLHttpRequest();
    this.xhr.open(method, fullURL, true);
    
    if (this._responseType) {
      this.xhr.responseType = this._responseType;
    }
    
    // Set headers
    Object.entries(this.headers).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        this.xhr.setRequestHeader(key, String(value));
      }
    });
  }

  // Enhanced data sending with better content type handling
  _sendData(data) {
    if (data === null || data === undefined) {
      this.xhr.send();
      return;
    }
    
    let processedData = data;
    const hasContentType = this.headers["Content-Type"] || this.headers["content-type"];
    
    // Handle different data types
    if (data instanceof FormData) {
      // Let browser set Content-Type for FormData (with boundary)
      processedData = data;
    } else if (data instanceof Blob || data instanceof ArrayBuffer) {
      processedData = data;
    } else if (typeof data === 'string') {
      // String data - send as-is, set text/plain if no content type
      if (!hasContentType) {
        this.xhr.setRequestHeader("Content-Type", "text/plain");
      }
      processedData = data;
    } else if (typeof data === 'object' && data !== null) {
      // Object data - JSON stringify and set application/json if no content type
      if (!hasContentType) {
        this.xhr.setRequestHeader("Content-Type", "application/json");
      }
      processedData = JSON.stringify(data);
    }
    
    // Apply request interceptor if exists
    if (this._requestInterceptor) {
      processedData = this._requestInterceptor(processedData, this.headers) || processedData;
    }
    
    this.xhr.send(processedData);
  }

  // GET request with better query parameter handling
  async get(url, params = null) {
    let fullURL = url;
    if (params) {
      const queryString = this._buildQueryString(params);
      fullURL += (url.includes('?') ? '&' : '?') + queryString;
    }
    
    this._prepareRequest("GET", fullURL);
    return await this._executeRequest();
  }

  // Build query string from object
  _buildQueryString(params) {
    if (typeof params === 'string') return params;
    
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, String(v)));
      } else if (value !== null && value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    return searchParams.toString();
  }

  // POST request
  async post(url, data = null) {
    this._prepareRequest("POST", url);
    return await this._executeRequest(data);
  }

  // PUT request
  async put(url, data = null) {
    this._prepareRequest("PUT", url);
    return await this._executeRequest(data);
  }

  // DELETE request
  async delete(url, data = null) {
    this._prepareRequest("DELETE", url);
    return await this._executeRequest(data);
  }

  // PATCH request
  async patch(url, data = null) {
    this._prepareRequest("PATCH", url);
    return await this._executeRequest(data);
  }

  // HEAD request
  async head(url) {
    this._prepareRequest("HEAD", url);
    return await this._executeRequest();
  }

  // OPTIONS request
  async options(url) {
    this._prepareRequest("OPTIONS", url);
    return await this._executeRequest();
  }

  // Unified request execution
  _executeRequest(data = null) {
    return new Promise((resolve, reject) => {
      this._handleResponse(resolve, reject);
      this._sendData(data);
    });
  }

  // File upload with progress and multiple file support
  async upload(url, formData, options = {}) {
    const { onProgress, onUploadProgress, method = 'POST' } = options;
    
    this._prepareRequest(method, url);
    
    return new Promise((resolve, reject) => {
      // Upload progress
      if (onProgress || onUploadProgress) {
        this.xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            const progressData = { progress, loaded: e.loaded, total: e.total, event: e };
            
            if (onProgress) onProgress(progress, progressData);
            if (onUploadProgress) onUploadProgress(progressData);
          }
        };
      }
      
      this._handleResponse(resolve, reject);
      this.xhr.send(formData);
    });
  }

  // Generic request method for custom HTTP methods
  async request(method, url, data = null) {
    this._prepareRequest(method, url);
    return await this._executeRequest(data);
  }

  // Static helper methods (create new instances)
  static async get(url, params = null) {
    return await new FetchX().get(url, params);
  }

  static async post(url, data = null) {
    return await new FetchX().post(url, data);
  }

  static async put(url, data = null) {
    return await new FetchX().put(url, data);
  }

  static async delete(url, data = null) {
    return await new FetchX().delete(url, data);
  }

  static async patch(url, data = null) {
    return await new FetchX().patch(url, data);
  }

  static async head(url) {
    return await new FetchX().head(url);
  }

  static async options(url) {
    return await new FetchX().options(url);
  }

  // Create instance with base configuration
  static create(config = {}) {
    const instance = new FetchX();
    
    if (config.baseURL) instance.baseURL(config.baseURL);
    if (config.timeout) instance.timeout(config.timeout);
    if (config.headers) instance.header(config.headers);
    if (config.responseType) instance.responseType(config.responseType);
    if (config.requestInterceptor) instance.interceptRequest(config.requestInterceptor);
    if (config.responseInterceptor) instance.interceptResponse(config.responseInterceptor);
    
    return instance;
  }
}

// Global helper function
function fetchx(config = {}) {
  return Object.keys(config).length > 0 ? FetchX.create(config) : new FetchX();
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FetchX, fetchx };
} else if (typeof window !== 'undefined') {
  window.FetchX = FetchX;
  window.fetchx = fetchx;
}