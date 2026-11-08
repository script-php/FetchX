# FetchX

**FetchX v0.0.19** is a lightweight, dependency-free, Promise-based HTTP client for browsers. It uses the native `XMLHttpRequest` API, offering a familiar, fetch-like interface while retaining XHR features such as upload progress, timeouts, and request cancellation.

## Features

- **Dependency-free:** No runtime packages or build step required for browser script usage.
- **Promise-based API:** Use `async`/`await` or `.then()` / `.catch()`.
- **Chainable configuration:** Set default headers, timeouts, response types, and base URLs.
- **HTTP methods:** `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, and generic `request`.
- **Automatic serialization:** JSON for objects/arrays; supports strings, `FormData`, `URLSearchParams`, `Blob`, and binary payloads.
- **Response parsing:** Automatic JSON detection, plus explicit text, JSON, Blob, ArrayBuffer, and document responses.
- **Progress callbacks:** Upload and download progress events.
- **Cancellation:** `AbortController` signals and client-wide `.abort()`.
- **Interceptors:** Synchronous or asynchronous request/response interceptors.
- **Error metadata:** Consistent error codes for HTTP, network, timeout, cancellation, and parsing failures.
- **Concurrent requests:** Multiple requests can share the same client instance.

## Installation

Download `fetchx.js` and include it in your page:

```html
<script src="/js/fetchx.js"></script>
```

The browser script exposes `FetchX` and `fetchx` globally. It also supports CommonJS and AMD loading. **This is not an ES module with named `import` exports.**

## Basic usage

```javascript
const api = fetchx();

try {
  const response = await api.get('/api/users');
  console.log(response.data);
} catch (error) {
  console.error(error.code, error.message);
}
```

Or with Promises:

```javascript
fetchx().get('/api/users')
  .then(response => console.log(response.data))
  .catch(error => console.error(error));
```

## Creating and configuring a client

```javascript
const api = fetchx({
  baseURL: 'https://api.example.com',
  timeout: 10000,
  headers: { Authorization: 'Bearer YOUR_TOKEN' },
  responseType: '' // Auto-detect JSON; default behavior
});

// Equivalent construction:
const otherApi = FetchX.create({ baseURL: 'https://api.example.com' });

// Or configure a new instance fluently:
const client = new FetchX()
  .baseURL('https://api.example.com')
  .timeout(10000)
  .header('Accept', 'application/json');
```

Configuration methods return the client instance and affect subsequent requests made with that instance. You can also supply per-request options.

### Available chainable methods

| Method | Purpose |
| --- | --- |
| `.header(name, value)` | Set a default request header. |
| `.header({ name: value })` | Set multiple default headers. |
| `.timeout(milliseconds)` | Set the default XHR timeout; `0` disables it. |
| `.responseType(type)` | Set the default response type. |
| `.baseURL(url)` | Prefix relative request URLs. |
| `.interceptRequest(fn)` | Set a request interceptor. |
| `.interceptResponse(fn)` | Set a response interceptor. |
| `.abort()` | Cancel outstanding requests belonging to the client. |

## HTTP methods

```javascript
const api = fetchx({ baseURL: 'https://api.example.com' });

// GET with query parameters, including array values
await api.get('/users', { page: 1, tags: ['new', 'active'] });

// POST JSON
await api.post('/users', { name: 'Jane', email: 'jane@example.com' });

// PUT and PATCH
await api.put('/users/123', { name: 'Jane Smith' });
await api.patch('/users/123', { active: true });

// DELETE, optionally with a body
await api.delete('/users/123');
await api.delete('/users/123', { reason: 'requested' });

// HEAD and OPTIONS
await api.head('/users/123');
await api.options('/users');

// Any supported HTTP method
await api.request('POST', '/events', { event: 'open' });
```

The general signature is `request(method, url, data = null, options = {})`.

For `get`, the signature is `get(url, params = null, options = {})`; for `head` and `options`, it is `(url, options = {})`.

## Request options

Most HTTP methods accept an `options` object:

```javascript
const response = await api.get('/users', { page: 2 }, {
  headers: { 'X-Test': 'example' },
  timeout: 5000,
  responseType: 'json',
  signal: controller.signal,
  withCredentials: false,
  validateStatus: status => status >= 200 && status < 300,
  onDownloadProgress: details => console.log(details.loaded)
});
```

| Option | Description |
| --- | --- |
| `headers` | Additional or overriding headers for this request. |
| `timeout` | Per-request timeout in milliseconds. |
| `responseType` | `''`, `'json'`, `'text'`, `'blob'`, `'arraybuffer'`, or `'document'`. |
| `signal` | An `AbortSignal` used to cancel the request. |
| `withCredentials` | Set XHR's `withCredentials` flag. |
| `validateStatus` | Function that decides which HTTP statuses resolve successfully. |
| `onUploadProgress` | Upload progress callback receiving a details object. |
| `onDownloadProgress` | Download progress callback receiving a details object. |
| `onProgress` | Legacy-style progress callback receiving `(percentage, details)` for normal downloads; used for upload progress with `.upload()`. |

`validateStatus` defaults to accepting HTTP status codes from 200 through 299.

### Headers and authentication

```javascript
const api = fetchx()
  .header('Authorization', 'Bearer YOUR_TOKEN')
  .header('Accept-Language', 'en-US');

await api.get('/api/profile', null, {
  headers: { 'X-Request-ID': 'example-123' }
});
```

Do not embed private API secrets in browser JavaScript. Use appropriate authentication and authorization on the server.

### Timeouts

```javascript
try {
  await fetchx().timeout(5000).get('/api/slow');
} catch (error) {
  if (error.code === 'ERR_TIMEOUT') {
    console.log('The request timed out');
  }
}
```

### Response types

```javascript
const api = fetchx();

const json = await api.get('/api/data'); // JSON auto-detected by Content-Type
const text = await api.get('/api/message', null, { responseType: 'text' });
const image = await api.get('/images/photo.jpg', null, { responseType: 'blob' });
const bytes = await api.get('/files/data.bin', null, { responseType: 'arraybuffer' });
const xml = await api.get('/files/data.xml', null, { responseType: 'document' });

console.log(json.data, text.data, image.data, bytes.data, xml.data);
```

For `204`, `205`, `304`, and `HEAD` responses, FetchX returns `data: null`.

## Request bodies

```javascript
// Plain object: automatically serialized as JSON
await api.post('/api/users', { name: 'Jane' });

// Text
await api.post('/api/notes', 'Hello world');

// URL-encoded form
await api.post('/api/form', new URLSearchParams({ name: 'Jane' }));

// Multipart form: browser sets the boundary automatically
const form = new FormData();
form.append('name', 'Jane');
await api.post('/api/form', form);

// Binary
await api.post('/api/binary', new Uint8Array([1, 2, 3]).buffer);
```

When using `FormData`, FetchX removes an explicitly configured `Content-Type` header so the browser can set the correct multipart boundary.

## File uploads and progress

**Important v0.0.19 change:** `.upload()` takes an **options object** as its third argument, not a callback function.

```html
<input id="file" type="file">
<progress id="upload-progress" max="100" value="0"></progress>
```

```javascript
const input = document.querySelector('#file');
const progressBar = document.querySelector('#upload-progress');

async function uploadSelectedFile() {
  const file = input.files[0];
  if (!file) return;

  const form = new FormData();
  form.append('file', file);

  const response = await fetchx().upload('/api/upload', form, {
    onUploadProgress(details) {
      if (details.progress !== null) {
        progressBar.value = details.progress;
      }
      console.log('Uploaded bytes:', details.loaded);
    }
  });

  console.log('Upload complete:', response.data);
}
```

Progress detail objects contain `progress` (percentage or `null`), `loaded`, `total`, and the native `event`. Browsers may not always provide a computable total.

The older `onProgress` callback style is also available for `.upload()`:

```javascript
await fetchx().upload('/api/upload', form, {
  onProgress(percentage, details) {
    console.log(percentage, details.loaded);
  }
});
```

## Downloads and progress

```javascript
const response = await fetchx().get('/api/download', null, {
  responseType: 'blob',
  onDownloadProgress(details) {
    console.log(details.loaded, details.total, details.progress);
  }
});

const url = URL.createObjectURL(response.data);
const link = document.createElement('a');
link.href = url;
link.download = 'download.bin';
link.click();
URL.revokeObjectURL(url);
```

## Canceling requests

### Cancel one request with `AbortController`

```javascript
const controller = new AbortController();
const promise = fetchx().get('/api/slow', null, {
  signal: controller.signal
});

controller.abort();

try {
  await promise;
} catch (error) {
  if (error.code === 'ERR_CANCELED') {
    console.log('Request canceled');
  }
}
```

### Cancel all requests on a client

```javascript
const api = fetchx();
const first = api.get('/api/first');
const second = api.get('/api/second');

// Attach rejection handlers before aborting to avoid unhandled rejections.
const outcomes = Promise.allSettled([first, second]);
api.abort();
console.log(await outcomes);

// The client can be reused for subsequent requests.
await api.get('/api/health');
```

`api.abort()` cancels the client's active and pending operations, including operations waiting in asynchronous interceptors.

## Interceptors

### Request interceptor

A request interceptor receives `(data, headers, config)`. It may mutate `headers` or `config`. If it returns a value other than `undefined`, that value replaces the outgoing request data.

```javascript
const api = fetchx({ baseURL: '/api' });

api.interceptRequest(async (data, headers, config) => {
  headers['X-App-Version'] = '1.0';
  return data;
});

await api.post('/events', { action: 'save' });
```

### Response interceptor

A response interceptor receives the successful response object and can return a replacement value, synchronously or asynchronously:

```javascript
api.interceptResponse(response => response.data);

const users = await api.get('/users'); // Returns response.data directly
```

Only one request interceptor and one response interceptor are stored per client; calling the corresponding setter again replaces the previous one. HTTP errors are rejected before the response interceptor runs.

## Response object

Successful requests normally resolve to:

```javascript
{
  data: /* parsed body, text, Blob, etc. */,
  status: 200,
  statusText: 'OK',
  headers: { /* lower-case response header names */ },
  config: {
    url: '/api/users',
    method: 'GET',
    headers: { /* request headers */ }
  },
  xhr: /* underlying XMLHttpRequest */
}
```

If you use a response interceptor that returns a different value, the resolved result is whatever that interceptor returns.

## Error handling

FetchX uses `FetchXError` for HTTP/network/timeout/cancellation/parsing failures, with these codes:

| Error code | Meaning |
| --- | --- |
| `ERR_HTTP` | HTTP status rejected by `validateStatus`. |
| `ERR_NETWORK` | Network failure, blocked request, or XHR status 0. |
| `ERR_TIMEOUT` | XHR timeout. |
| `ERR_CANCELED` | Request canceled. |
| `ERR_PARSE` | Invalid JSON when JSON parsing was expected. |

```javascript
try {
  await fetchx().get('/api/users');
} catch (error) {
  switch (error.code) {
    case 'ERR_HTTP':
      console.error('HTTP status:', error.status);
      console.error('Server response:', error.response?.data);
      break;
    case 'ERR_TIMEOUT':
      console.error('Request timed out');
      break;
    case 'ERR_CANCELED':
      console.log('Request canceled');
      break;
    case 'ERR_PARSE':
      console.error('Invalid JSON response');
      break;
    case 'ERR_NETWORK':
      console.error('Network or CORS error');
      break;
    default:
      console.error('Request setup or interceptor error:', error);
  }
}
```

Invalid request configuration (for example, malformed headers or unsupported response types) can throw `TypeError` or `RangeError`. Exceptions raised by user callbacks/interceptors may propagate as their original error types.

## CORS and credentials

FetchX follows the browser's same-origin and CORS rules; it does not bypass them. Your API server must return the correct `Access-Control-Allow-*` headers when a cross-origin request is allowed. Custom headers or JSON requests can trigger a preflight `OPTIONS` request.

```javascript
await fetchx().get('https://api.example.com/account', null, {
  withCredentials: true
});
```

Credentialed cross-origin requests require the server to allow credentials and specify an explicit allowed origin. Use HTTPS for production traffic.

## Browser compatibility and requirements

FetchX uses modern JavaScript syntax and APIs including `Promise`, `async`/`await`, `Set`, `Map`, `URLSearchParams`, and optional chaining. It requires a browser that supports these features as well as `XMLHttpRequest`. Older browsers may require transpilation or polyfills; a Promise polyfill alone is not sufficient for every older browser.

The v0.0.19 browser integration suite was reported passing **49/49 tests** in Chromium, Firefox, and iPhone Safari. Extended stress runs were also reported passing **10/10 checks** with **20,191 settled requests** in Chrome and iPhone Safari. These results are useful compatibility evidence, not a guarantee against all bugs or long-term memory leaks. Edge and Opera were not separately certified in those runs.

## Notes for production

- Deploy the tested v0.0.19 file without changing its behavior unexpectedly.
- Handle `ERR_NETWORK`, `ERR_TIMEOUT`, and `ERR_CANCELED` appropriately in your UI.
- Use server-side authentication/authorization and correct CORS policies.
- Do not assume that a resolved HTTP response always contains JSON.
- Consider a rollback strategy when replacing an existing HTTP client.
- For memory-sensitive applications, monitor long-lived pages under actual workloads.

## License

MIT (as stated in the original project README; consult the repository's `LICENSE` file for the authoritative terms).

## Contributing

Contributions, bug reports, and pull requests are welcome.