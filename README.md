# FetchX

FetchX is a lightweight, chainable HTTP client for the browser built on top of XMLHttpRequest that provides a clean, intuitive API for making AJAX requests.

## Features

- **Chainable API** - Use method chaining for a cleaner request configuration
- **Promise-based** - Modern promise-based interface for handling responses
- **Request/Response Handling** - Automatic content-type detection and parsing
- **Flexible Config** - Set headers, timeouts, and response types with ease
- **Progress Tracking** - Built-in support for upload progress monitoring
- **Request Abortion** - Easily cancel in-flight requests when needed

## Installation

Simply include the `fetchx.js` file in your project:

```html
<script src="path/to/fetchx.js"></script>
```

## Basic Usage

```javascript
// Make a simple GET request
fetchx()
  .get('https://api.example.com/users')
  .then(response => {
    console.log(response.data);
  })
  .catch(error => {
    console.error('Request failed:', error);
  });
```

## API Reference

### Creating a FetchX Instance

```javascript
// Create a new instance
const request = fetchx();

// Or create a new instance directly
const request = new FetchX();
```

### Request Methods

#### GET Request

```javascript
// Simple GET
fetchx().get('https://api.example.com/users');

// GET with query parameters
fetchx().get('https://api.example.com/users', { page: 1, limit: 10 });
```

#### POST Request

```javascript
// POST with JSON data
fetchx().post('https://api.example.com/users', {
  name: 'John Doe',
  email: 'john@example.com'
});

// POST with FormData
const formData = new FormData();
formData.append('name', 'John Doe');
formData.append('email', 'john@example.com');
fetchx().post('https://api.example.com/users', formData);
```

#### PUT Request

```javascript
fetchx().put('https://api.example.com/users/123', {
  name: 'John Updated',
  email: 'john.updated@example.com'
});
```

#### PATCH Request

```javascript
fetchx().patch('https://api.example.com/users/123', {
  name: 'John Patched'
});
```

#### DELETE Request

```javascript
// Simple DELETE
fetchx().delete('https://api.example.com/users/123');

// DELETE with body
fetchx().delete('https://api.example.com/users/123', {
  reason: 'User requested account deletion'
});
```

### Request Configuration

#### Setting Headers

```javascript
fetchx()
  .header('Authorization', 'Bearer token123')
  .header('Accept-Language', 'en-US')
  .get('https://api.example.com/users');
```

#### Setting Timeout

```javascript
fetchx()
  .timeout(5000) // 5 seconds timeout
  .get('https://api.example.com/users');
```

#### Setting Response Type

```javascript
// Get response as JSON (also automatic if Content-Type is application/json)
fetchx()
  .responseType('json')
  .get('https://api.example.com/data');

// Get response as text
fetchx()
  .responseType('text')
  .get('https://api.example.com/textdata');

// Get response as blob (for binary data like images)
fetchx()
  .responseType('blob')
  .get('https://api.example.com/image.jpg');

// Get response as XML document
fetchx()
  .responseType('document')
  .get('https://api.example.com/data.xml');
```

### File Uploads

```javascript
const formData = new FormData();
const fileInput = document.querySelector('input[type="file"]');
formData.append('file', fileInput.files[0]);

fetchx().upload(
  'https://api.example.com/upload',
  formData,
  (progress, event) => {
    console.log(`Upload progress: ${progress}%`);
    // Update UI with upload progress
    document.querySelector('.progress-bar').style.width = `${progress}%`;
  }
).then(response => {
  console.log('Upload complete:', response.data);
});
```

### Aborting Requests

```javascript
const request = fetchx();

// Start the request
request.get('https://api.example.com/large-data');

// Later, abort the request if needed
setTimeout(() => {
  request.abort();
  console.log('Request aborted');
}, 1000);
```

### Response Object

The response object contains:

```javascript
{
  data: /* parsed response data */,
  status: /* HTTP status code (e.g., 200) */,
  statusText: /* HTTP status text (e.g., "OK") */,
  xhr: /* The original XMLHttpRequest object */
}
```

### Error Handling

```javascript
fetchx()
  .get('https://api.example.com/users')
  .then(response => {
    // Handle success
  })
  .catch(error => {
    console.error('Status:', error.status);
    console.error('Status Text:', error.statusText);
    console.error('Response:', error.response);
  });
```

## Advanced Examples

### Complete Request with All Options

```javascript
fetchx()
  .header('Authorization', 'Bearer token123')
  .header('X-Custom-Header', 'Custom Value')
  .timeout(10000)
  .responseType('json')
  .post('https://api.example.com/data', {
    user: 'john',
    action: 'update'
  })
  .then(response => {
    console.log('Success:', response.data);
  })
  .catch(error => {
    if (error.status === 0 && error.statusText === 'Request timeout') {
      console.error('Request timed out');
    } else {
      console.error('Request failed:', error);
    }
  });
```

### Authentication Example

```javascript
function authenticateUser(credentials) {
  return fetchx()
    .post('https://api.example.com/login', credentials)
    .then(response => {
      // Store the token
      localStorage.setItem('authToken', response.data.token);
      return response.data;
    });
}

function fetchProtectedResource() {
  const token = localStorage.getItem('authToken');
  
  return fetchx()
    .header('Authorization', `Bearer ${token}`)
    .get('https://api.example.com/protected-resource');
}
```

### Handling Different Response Types

```javascript
// Download an image
fetchx()
  .responseType('blob')
  .get('https://example.com/image.jpg')
  .then(response => {
    const imageUrl = URL.createObjectURL(response.data);
    document.getElementById('preview').src = imageUrl;
  });

// Get XML data
fetchx()
  .responseType('document')
  .get('https://example.com/data.xml')
  .then(response => {
    const xmlDoc = response.data;
    const items = xmlDoc.getElementsByTagName('item');
    // Process XML elements
  });
```

## Browser Compatibility

FetchX works in all modern browsers that support XMLHttpRequest and Promises:

- Chrome
- Firefox
- Safari
- Edge
- Opera

For older browsers, you may need to include a Promise polyfill.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.