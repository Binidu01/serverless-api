import { displayBiniStartup } from '../env-checker.js';
import fs from 'fs';
import path from 'path';

export function biniPreviewPlugin() {
  return {
    name: 'bini-preview-plugin',
    
    configurePreviewServer(server) {
      // Check if dist exists and has necessary files BEFORE server starts
      const distPath = path.join(process.cwd(), 'dist');
      const indexHtmlPath = path.join(distPath, 'index.html');
      
      // Validate build output before allowing server to start
      if (!fs.existsSync(distPath)) {
        console.log('❌ Build directory not found: dist');
        console.log('💡 Run: npm run build');
        process.exit(1);
      }
      
      if (!fs.existsSync(indexHtmlPath)) {
        console.log('❌ Build incomplete: index.html missing');
        console.log('💡 Run: npm run build');
        process.exit(1);
      }
      
      // Removed the source modification check to prevent "Source files modified since last build" warnings
      
      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          // Let Vite handle the Local/Network URLs, we just add Environments and Ready
          displayBiniStartup({
            mode: 'preview'
          });
        }, 100);
      });
    }
  }
}