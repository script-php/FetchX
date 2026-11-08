/**
 * FetchX - A lightweight, promise-based HTTP client for the browser using XMLHttpRequest.
 * Version: 0.0.8
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (typeof define === 'function' && define.amd) define([], () => api);
  else if (root) { root.FetchX = api.FetchX; root.fetchx = api.fetchx; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TYPES = ['', 'json', 'text', 'blob', 'arraybuffer', 'document'];
  const isBody = value => value !== null && value !== undefined;
  const isPlainObject = value => Object.prototype.toString.call(value) === '[object Object]';
  const getHeader = (headers, name) => Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  const setHeader = (headers, name, value) => {
    const old = getHeader(headers, name);
    if (old && old !== name) delete headers[old];
    headers[name] = value;
  };
  const removeHeader = (headers, name) => {
    const old = getHeader(headers, name);
    if (old) delete headers[old];
  };
  const parseHeaders = raw => {
    const out = {};
    String(raw || '').trim().split(/\r?\n/).forEach(line => {
      const colon = line.indexOf(':');
      if (colon > 0) out[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    });
    return out;
  };
  const queryString = params => {
    if (typeof params === 'string') return params.replace(/^\?/, '');
    const query = new URLSearchParams();
    if (params instanceof URLSearchParams) return params.toString();
    for (const [key, value] of Object.entries(params || {})) {
      if (Array.isArray(value)) value.forEach(v => { if (v != null) query.append(key, String(v)); });
      else if (value != null) query.append(key, String(value));
    }
    return query.toString();
  };

  class FetchXError extends Error {
    constructor(message, code, response = null, cause = null) {
      super(message);
      this.name = 'FetchXError';
      this.code = code;
      this.response = response;
      this.status = response ? response.status : 0;
      this.statusText = response ? response.statusText : message;
      this.isNetworkError = code === 'ERR_NETWORK';
      this.isCanceled = code === 'ERR_CANCELED';
      if (cause) this.cause = cause;
    }
  }

  class FetchX {
    constructor() {
      this.xhr = null; // Last started request; retained for legacy inspection.
      this.headers = { Accept: 'application/json, text/html', 'X-Requested-With': 'XMLHttpRequest' };
      this._timeout = 0;
      this._responseType = '';
      this._baseURL = '';
      this._requestInterceptor = null;
      this._responseInterceptor = null;
      this._active = new Set();
      this.aborted = false; // Legacy property; true after abort() until next request.
    }

    header(key, value) {
      if (key && typeof key === 'object') {
        for (const [name, val] of Object.entries(key)) setHeader(this.headers, name, val);
      } else if (typeof key === 'string') setHeader(this.headers, key, value);
      return this;
    }
    timeout(ms) {
      const n = Number(ms);
      if (!Number.isFinite(n) || n < 0) throw new TypeError('Timeout must be a non-negative finite number');
      this._timeout = Math.floor(n);
      return this;
    }
    responseType(type) {
      if (!TYPES.includes(type)) throw new TypeError('Invalid response type: ' + type);
      this._responseType = type;
      return this;
    }
    baseURL(url) {
      if (typeof url !== 'string') throw new TypeError('baseURL must be a string');
      this._baseURL = url.replace(/\/$/, '');
      return this;
    }
    interceptRequest(fn) {
      if (fn != null && typeof fn !== 'function') throw new TypeError('Interceptor must be a function');
      this._requestInterceptor = fn;
      return this;
    }
    interceptResponse(fn) {
      if (fn != null && typeof fn !== 'function') throw new TypeError('Interceptor must be a function');
      this._responseInterceptor = fn;
      return this;
    }
    // Cancel every in-flight request belonging to this client.
    abort() {
      this.aborted = true;
      for (const xhr of Array.from(this._active)) xhr.abort();
      return this;
    }
    _buildURL(url) {
      if (typeof url !== 'string' || !url) throw new TypeError('URL is required');
      if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(url)) return url;
      if (!this._baseURL) return url;
      return this._baseURL + '/' + url.replace(/^\//, '');
    }
    _buildQueryString(params) { return queryString(params); }
    _parseResponseHeaders(raw) { return parseHeaders(raw); }
    _createError(response = null, message = null) {
      return new FetchXError(message || (response ? 'HTTP ' + response.status : 'Network Error'), response ? 'ERR_HTTP' : 'ERR_NETWORK', response);
    }

    get(url, params = null, options = {}) {
      const query = params == null ? '' : queryString(params);
      if (query) {
        const hashIndex = url.indexOf('#');
        const hash = hashIndex < 0 ? '' : url.slice(hashIndex);
        const path = hashIndex < 0 ? url : url.slice(0, hashIndex);
        url = path + (path.includes('?') ? (/[?&]$/.test(path) ? '' : '&') : '?') + query + hash;
      }
      return this.request('GET', url, null, options);
    }
    post(url, data = null, options = {}) { return this.request('POST', url, data, options); }
    put(url, data = null, options = {}) { return this.request('PUT', url, data, options); }
    delete(url, data = null, options = {}) { return this.request('DELETE', url, data, options); }
    patch(url, data = null, options = {}) { return this.request('PATCH', url, data, options); }
    head(url, options = {}) { return this.request('HEAD', url, null, options); }
    options(url, options = {}) { return this.request('OPTIONS', url, null, options); }
    upload(url, formData, options = {}) {
      const { method = 'POST', onProgress, onUploadProgress, ...rest } = options;
      return this.request(method, url, formData, { ...rest, onProgress, onUploadProgress, multipart: true });
    }

    async request(method, url, data = null, options = {}) {
      const verb = String(method).toUpperCase();
      const fullURL = this._buildURL(url);
      const headers = { ...this.headers };
      if (options.headers) for (const [k, v] of Object.entries(options.headers)) setHeader(headers, k, v);
      const config = { url: fullURL, method: verb, headers, data, timeout: options.timeout ?? this._timeout,
        responseType: options.responseType ?? this._responseType };
      if (!TYPES.includes(config.responseType)) throw new TypeError('Invalid response type');
      if (!Number.isFinite(Number(config.timeout)) || Number(config.timeout) < 0) throw new TypeError('Invalid timeout');
      // Backwards compatible interceptor signature: (data, headers, config).
      // Returning undefined retains the original data; falsy values are respected.
      if (this._requestInterceptor) {
        const result = await this._requestInterceptor(config.data, config.headers, config);
        if (result !== undefined) config.data = result;
      }
      if (options.signal?.aborted) throw new FetchXError('Request aborted', 'ERR_CANCELED');
      const body = config.data;
      const formData = typeof FormData !== 'undefined' && body instanceof FormData;
      const urlParams = typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;
      const blob = typeof Blob !== 'undefined' && body instanceof Blob;
      const binary = body instanceof ArrayBuffer || ArrayBuffer.isView(body);
      if (formData || options.multipart) removeHeader(config.headers, 'Content-Type');
      else if (isPlainObject(body) || Array.isArray(body)) {
        if (!getHeader(config.headers, 'Content-Type')) setHeader(config.headers, 'Content-Type', 'application/json');
      } else if (urlParams) {
        if (!getHeader(config.headers, 'Content-Type')) setHeader(config.headers, 'Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
      } else if (typeof body === 'string' && !getHeader(config.headers, 'Content-Type')) {
        setHeader(config.headers, 'Content-Type', 'text/plain;charset=UTF-8');
      }
      let payload = body;
      if ((isPlainObject(body) || Array.isArray(body)) && !formData && !blob && !binary && !urlParams) {
        const contentTypeKey = getHeader(config.headers, 'Content-Type');
        const contentType = contentTypeKey ? String(config.headers[contentTypeKey]).toLowerCase() : '';
        payload = contentType.includes('application/x-www-form-urlencoded') ? queryString(body) : JSON.stringify(body);
      }
      this.aborted = false;
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        this.xhr = xhr;
        this._active.add(xhr);
        let settled = false;
        const signal = options.signal;
        const onSignalAbort = () => xhr.abort();
        const cleanup = () => {
          this._active.delete(xhr);
          if (signal) signal.removeEventListener('abort', onSignalAbort);
        };
        const fail = error => { if (settled) return; settled = true; cleanup(); reject(error); };
        const succeed = value => { if (settled) return; settled = true; cleanup(); resolve(value); };
        xhr.onload = async () => {
          if (settled) return;
          let response;
          try {
            const responseHeaders = parseHeaders(xhr.getAllResponseHeaders());
            const contentType = (responseHeaders['content-type'] || '').toLowerCase();
            let responseData;
            if (verb === 'HEAD' || xhr.status === 204 || xhr.status === 205) responseData = null;
            else if (['json', 'blob', 'arraybuffer', 'document'].includes(config.responseType)) {
              responseData = xhr.response;
              // Native XHR JSON parsing returns null for empty or invalid JSON.
            } else {
              const raw = xhr.responseText;
              if (config.responseType === '' && /(?:^|\/)json(?:\s*;|$)|\+json(?:\s*;|$)/i.test(contentType)) {
                responseData = raw === '' ? null : JSON.parse(raw);
              } else responseData = raw;
            }
            response = { data: responseData, status: xhr.status, statusText: xhr.statusText,
              headers: responseHeaders, config: { url: xhr.responseURL || config.url, method: verb, headers: { ...config.headers } }, xhr };
            if (xhr.status < 200 || xhr.status >= 300) return fail(new FetchXError('HTTP ' + xhr.status + (xhr.statusText ? ': ' + xhr.statusText : ''), 'ERR_HTTP', response));
            const result = this._responseInterceptor ? await this._responseInterceptor(response) : response;
            succeed(result);
          } catch (error) {
            fail(error instanceof SyntaxError ? new FetchXError('Invalid JSON response', 'ERR_PARSE', response, error) : error);
          }
        };
        xhr.onerror = () => fail(new FetchXError('Network Error', 'ERR_NETWORK'));
        xhr.ontimeout = () => fail(new FetchXError('Request timeout', 'ERR_TIMEOUT'));
        xhr.onabort = () => fail(new FetchXError('Request aborted', 'ERR_CANCELED'));
        try {
          xhr.open(verb, config.url, true);
          if (config.responseType) xhr.responseType = config.responseType;
          xhr.timeout = Number(config.timeout);
          if (options.withCredentials !== undefined) xhr.withCredentials = !!options.withCredentials;
          for (const [key, value] of Object.entries(config.headers)) {
            if (value != null) xhr.setRequestHeader(key, String(value));
          }
          if (options.onProgress) xhr.onprogress = e => options.onProgress(e.lengthComputable ? Math.round(e.loaded / e.total * 100) : null, { loaded: e.loaded, total: e.total, event: e });
          if (options.onUploadProgress || options.multipart && options.onProgress) {
            xhr.upload.onprogress = e => {
              const details = { progress: e.lengthComputable ? Math.round(e.loaded / e.total * 100) : null,
                loaded: e.loaded, total: e.total, event: e };
              if (options.multipart && options.onProgress) options.onProgress(details.progress, details);
              if (options.onUploadProgress) options.onUploadProgress(details);
            };
          }
          if (signal) {
            signal.addEventListener('abort', onSignalAbort, { once: true });
            if (signal.aborted) return xhr.abort();
          }
          xhr.send(isBody(payload) ? payload : null);
        } catch (error) { fail(error); }
      });
    }

    static create(config = {}) {
      const client = new FetchX();
      if (config.baseURL !== undefined) client.baseURL(config.baseURL);
      if (config.timeout !== undefined) client.timeout(config.timeout);
      if (config.headers) client.header(config.headers);
      if (config.responseType !== undefined) client.responseType(config.responseType);
      if (config.requestInterceptor) client.interceptRequest(config.requestInterceptor);
      if (config.responseInterceptor) client.interceptResponse(config.responseInterceptor);
      return client;
    }
    static get(url, params, options) { return new FetchX().get(url, params, options); }
    static post(url, data, options) { return new FetchX().post(url, data, options); }
    static put(url, data, options) { return new FetchX().put(url, data, options); }
    static delete(url, data, options) { return new FetchX().delete(url, data, options); }
    static patch(url, data, options) { return new FetchX().patch(url, data, options); }
    static head(url, options) { return new FetchX().head(url, options); }
    static options(url, options) { return new FetchX().options(url, options); }
  }
  function fetchx(config = {}) { return FetchX.create(config); }
  return { FetchX, FetchXError, fetchx };
});
