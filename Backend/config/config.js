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
    
    // Resolve all paths to be absolute from the backend directory
    const resolvedConfig = {
      ...config,
      paths: {
        ...config.paths,
        // Convert relative paths to absolute paths from backend directory
        audioFiles: join(__dirname, 'audios'),
        binaries: join(__dirname, 'bin'),
        ffmpeg: join(__dirname, 'bin', 'ffmpeg'),
        rhubarb: process.platform === 'win32' 
          ? join(__dirname, 'bin', 'rhubarb.exe')
          : join(__dirname, 'bin', 'rhubarb')
      }
    };
    
    return resolvedConfig;
  } catch (error) {
    console.error('Error loading configuration:', error);
    process.exit(1);
  }
};

const config = loadConfig();

export default config;
