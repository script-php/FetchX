/**
 * FetchX - A lightweight, promise-based HTTP client for the browser using XMLHttpRequest.
 * Version: 0.0.18
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
  const validHeaderName = name => typeof name === 'string' && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name);
  const validateHeader = (name, value) => {
    if (!validHeaderName(name)) throw new TypeError('Invalid HTTP header name');
    if (value != null && /[\r\n\0]/.test(String(value))) throw new TypeError('Invalid HTTP header value');
  };
  const getHeader = (headers, name) => Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  const setHeader = (headers, name, value) => {
    validateHeader(name, value);
    const old = getHeader(headers, name);
    if (old && old !== name) delete headers[old];
    headers[name] = value;
  };
  const removeHeader = (headers, name) => {
    const old = getHeader(headers, name);
    if (old) delete headers[old];
  };
  const parseHeaders = raw => {
    const out = Object.create(null);
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
      this._pending = new Set();
      this._processing = new Set();
      this._cancelActive = new Map();
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
      if (n > 2147483647) throw new RangeError('Timeout exceeds XMLHttpRequest limit');
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
      for (const pending of Array.from(this._pending)) pending.cancel();
      for (const cancel of Array.from(this._cancelActive.values())) cancel();
      for (const cancel of Array.from(this._processing)) cancel();
      return this;
    }
    _buildURL(url) {
      if (typeof url !== 'string' || !url) throw new TypeError('URL is required');
      if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) return url;
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
      if (options == null || typeof options !== 'object') throw new TypeError('options must be an object');
      if (!/^[A-Z][A-Z0-9!#$%&'*+.^_`|~-]*$/.test(verb)) throw new TypeError('Invalid HTTP method');
      const headers = { ...this.headers };
      if (options.headers) for (const [k, v] of Object.entries(options.headers)) setHeader(headers, k, v);
      // Validate inherited headers as well: public .headers may have been mutated directly.
      for (const [k, v] of Object.entries(headers)) validateHeader(k, v);
      const config = { url: fullURL, method: verb, headers, data, timeout: options.timeout ?? this._timeout,
        responseType: options.responseType ?? this._responseType };
      if (!TYPES.includes(config.responseType)) throw new TypeError('Invalid response type');
      if (!Number.isFinite(Number(config.timeout)) || Number(config.timeout) < 0 || Number(config.timeout) > 2147483647) throw new TypeError('Invalid timeout');
      const validateStatus = options.validateStatus ?? (status => status >= 200 && status < 300);
      if (typeof validateStatus !== 'function') throw new TypeError('validateStatus must be a function');
      const signal = options.signal;
      if (signal != null && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw new TypeError('signal must be an AbortSignal');
      for (const name of ['onProgress', 'onUploadProgress', 'onDownloadProgress']) {
        if (options[name] != null && typeof options[name] !== 'function') throw new TypeError(name + ' must be a function');
      }
      if (signal?.aborted) throw new FetchXError('Request aborted', 'ERR_CANCELED');
      let pendingCanceled = false;
      let pendingReject;
      const pending = { cancel: () => { pendingCanceled = true; pendingReject?.(new FetchXError('Request aborted', 'ERR_CANCELED')); } };
      this._pending.add(pending);
      const pendingAbort = () => pending.cancel();
      signal?.addEventListener('abort', pendingAbort, { once: true });
      const cancellation = new Promise((_, reject) => { pendingReject = reject; if (pendingCanceled) pending.cancel(); });
      try {
      // Backwards compatible interceptor signature: (data, headers, config).
      // Returning undefined retains the original data; falsy values are respected.
      if (this._requestInterceptor) {
        const result = await Promise.race([Promise.resolve().then(() => this._requestInterceptor(config.data, config.headers, config)), cancellation]);
        if (result !== undefined) config.data = result;
      }
      if (pendingCanceled || signal?.aborted) throw new FetchXError('Request aborted', 'ERR_CANCELED');
      // Interceptors receive mutable headers; reject unsafe values before XHR setup.
      if (!config.headers || typeof config.headers !== 'object' || Array.isArray(config.headers)) throw new TypeError('Invalid request headers');
      for (const [k, v] of Object.entries(config.headers)) validateHeader(k, v);
      const body = config.data;
      const formData = typeof FormData !== 'undefined' && body instanceof FormData;
      const urlParams = typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;
      const blob = typeof Blob !== 'undefined' && body instanceof Blob;
      const binary = body instanceof ArrayBuffer || ArrayBuffer.isView(body);
      if (formData) removeHeader(config.headers, 'Content-Type');
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
      if (pendingCanceled || signal?.aborted) throw new FetchXError('Request aborted', 'ERR_CANCELED');
      // Interceptors can mutate config; validate the final request settings.
      if (typeof config.url !== 'string' || !config.url) throw new TypeError('Invalid request URL');
      // The request interceptor may change the method. Validate and consistently
      // use that final method for XHR and the returned response metadata.
      if (typeof config.method !== 'string' || !/^[A-Za-z][A-Za-z0-9!#$%&'*+.^_`|~-]*$/.test(config.method)) throw new TypeError('Invalid request method');
      config.method = config.method.toUpperCase();
      if (!config.headers || typeof config.headers !== 'object' || Array.isArray(config.headers)) throw new TypeError('Invalid request headers');
      if (!TYPES.includes(config.responseType)) throw new TypeError('Invalid response type');
      if (!Number.isFinite(Number(config.timeout)) || Number(config.timeout) < 0 || Number(config.timeout) > 2147483647) throw new TypeError('Invalid timeout');
      for (const [k, v] of Object.entries(config.headers)) validateHeader(k, v);
      this._pending.delete(pending);
      signal?.removeEventListener('abort', pendingAbort);
      this.aborted = false;
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        this.xhr = xhr;
        this._active.add(xhr);
        let settled = false;
        let responseCancel = null;
        let processingCancel = null;
        const onSignalAbort = () => cancelXHR();
        const cleanup = () => {
          this._active.delete(xhr);
          this._cancelActive.delete(xhr);
          if (processingCancel) this._processing.delete(processingCancel);
          xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
          xhr.onprogress = null;
          if (xhr.upload) xhr.upload.onprogress = null;
          if (signal) signal.removeEventListener('abort', onSignalAbort);
        };
        const cancelXHR = () => { const error = new FetchXError('Request aborted', 'ERR_CANCELED'); if (responseCancel) responseCancel(error); try { if (this._active.has(xhr)) xhr.abort(); } finally { fail(error); } };
        this._cancelActive.set(xhr, cancelXHR);
        const fail = error => { if (settled) return; settled = true; cleanup(); reject(error); };
        const succeed = value => { if (settled) return; settled = true; cleanup(); resolve(value); };
        xhr.onload = async () => {
          if (settled) return;
          // HTTP transfer has finished; keep cancellation active while response interceptors run.
          this._active.delete(xhr);
          let response;
          try {
            const responseHeaders = parseHeaders(xhr.getAllResponseHeaders());
            const contentType = (responseHeaders['content-type'] || '').toLowerCase();
            let responseData;
            const accepted = xhr.status !== 0 && !!validateStatus(xhr.status);
            if (config.method === 'HEAD' || [204, 205, 304].includes(xhr.status)) responseData = null;
            else if (config.responseType === 'json') {
              // Parse manually to distinguish invalid JSON from valid null.
              const raw = xhr.responseText;
              responseData = raw.trim() === '' ? null : (!accepted ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : JSON.parse(raw));
            } else if (['blob', 'arraybuffer', 'document'].includes(config.responseType)) {
              responseData = xhr.response;
            } else {
              const raw = xhr.responseText;
              if (config.responseType === '' && /^(?:application\/json|[^;]+\+json)(?:\s*;|$)/i.test(contentType)) {
                responseData = raw.trim() === '' ? null : (!accepted ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : JSON.parse(raw));
              } else responseData = raw;
            }
            response = { data: responseData, status: xhr.status, statusText: xhr.statusText,
              headers: responseHeaders, config: { url: xhr.responseURL || config.url, method: config.method, headers: { ...config.headers } }, xhr };
            if (xhr.status === 0) return fail(new FetchXError('Network Error (status 0)', 'ERR_NETWORK', response));
            if (!accepted) return fail(new FetchXError('HTTP ' + xhr.status + (xhr.statusText ? ': ' + xhr.statusText : ''), 'ERR_HTTP', response));
            const result = this._responseInterceptor
              ? await Promise.race([Promise.resolve().then(() => this._responseInterceptor(response)), new Promise((_, reject) => {
                  if (settled) reject(new FetchXError('Request aborted', 'ERR_CANCELED'));
                  else { responseCancel = reject; processingCancel = () => reject(new FetchXError('Request aborted', 'ERR_CANCELED')); this._processing.add(processingCancel); }
                })]) : response;
            succeed(result);
          } catch (error) {
            if (error instanceof SyntaxError && !response) {
              response = { data: xhr.responseText, status: xhr.status, statusText: xhr.statusText,
                headers: parseHeaders(xhr.getAllResponseHeaders()), config: { url: xhr.responseURL || config.url, method: config.method, headers: { ...config.headers } }, xhr };
            }
            fail(error instanceof SyntaxError ? new FetchXError('Invalid JSON response', 'ERR_PARSE', response, error) : error);
          }
        };
        xhr.onerror = () => fail(new FetchXError('Network Error', 'ERR_NETWORK'));
        xhr.ontimeout = () => fail(new FetchXError('Request timeout', 'ERR_TIMEOUT'));
        xhr.onabort = () => { if (responseCancel) responseCancel(new FetchXError('Request aborted', 'ERR_CANCELED')); fail(new FetchXError('Request aborted', 'ERR_CANCELED')); };
        try {
          xhr.open(config.method, config.url, true);
          if (config.responseType && config.responseType !== 'json') xhr.responseType = config.responseType;
          xhr.timeout = Number(config.timeout);
          if (options.withCredentials !== undefined) xhr.withCredentials = !!options.withCredentials;
          for (const [key, value] of Object.entries(config.headers)) {
            if (value != null) xhr.setRequestHeader(key, String(value));
          }
          if ((options.onProgress && !options.multipart) || options.onDownloadProgress) xhr.onprogress = e => { try { const details = { progress: e.lengthComputable && e.total ? Math.round(e.loaded / e.total * 100) : null, loaded: e.loaded, total: e.total, event: e }; if (options.onProgress && !options.multipart) options.onProgress(details.progress, details); if (options.onDownloadProgress) options.onDownloadProgress(details); } catch (err) { fail(err); xhr.abort(); } };
          if (options.onUploadProgress || (options.multipart && options.onProgress)) {
            xhr.upload.onprogress = e => {
              const details = { progress: e.lengthComputable && e.total ? Math.round(e.loaded / e.total * 100) : null,
                loaded: e.loaded, total: e.total, event: e };
              try {
                if (options.multipart && options.onProgress) options.onProgress(details.progress, details);
                if (options.onUploadProgress) options.onUploadProgress(details);
              } catch (err) { fail(err); xhr.abort(); }
            };
          }
          if (signal) {
            signal.addEventListener('abort', onSignalAbort, { once: true });
            if (signal.aborted) return cancelXHR();
          }
          // XHR forbids a request body for GET/HEAD. Interceptors may change the method.
          xhr.send(config.method === 'GET' || config.method === 'HEAD' ? null : (isBody(payload) ? payload : null));
        } catch (error) { fail(error); }
      });
      } finally {
        this._pending.delete(pending);
        signal?.removeEventListener('abort', pendingAbort);
      }
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
    static upload(url, formData, options) { return new FetchX().upload(url, formData, options); }
    static request(method, url, data, options) { return new FetchX().request(method, url, data, options); }
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