import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration from root config.json
const loadConfig = () => {
  try {
    const configPath = join(__dirname, '..', 'config.json');
    const configData = readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    // Resolve paths relative to frontend directory
    const resolvedConfig = {
      ...config,
      paths: {
        ...config.paths,
        // API endpoints
        backendUrl: `http://${config.server.host}:${config.server.port}`
      }
    };
    
    return resolvedConfig;
  } catch (error) {
    console.error('Error loading configuration:', error);
    return {
      server: { port: parseInt(process.env.PORT) || 3000, host: process.env.HOST || 'localhost' },
      paths: { backendUrl: `http://${process.env.HOST || 'localhost'}:${parseInt(process.env.PORT) || 3000}` }
    };
  }
};

const config = loadConfig();

export default config;
