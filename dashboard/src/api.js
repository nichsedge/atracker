import axios from 'axios';

const API = '';

export async function fetchAPI(path, options = {}) {
  const method = options.method || 'GET';
  const url = `${API}${path}`;

  try {
    const response = await axios({
      method,
      url,
      data: options.body ? JSON.parse(options.body) : undefined,
      headers: options.headers || { 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      const errMessage = error.response.data?.detail || error.response.statusText;
      throw new Error(errMessage);
    }
    throw error;
  }
}
