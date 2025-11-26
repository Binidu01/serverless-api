const BINIJS_VERSION = "9.1.5";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vite-style logging formatter
function formatViteLog(file, action = 'page reload') {
  const t = new Date().toLocaleTimeString("en-US", { hour12: true, hour: "numeric", minute: "2-digit", second: "2-digit" });
  const gy = "[90m";     // light gray (timestamp)
  const c = "[36m";      // cyan [vite]
  const r = "[0m";       // reset
  const dg = "[2m[90m"; // darker gray (client)
  const g = "[32m";      // green (page reload)
  const lg = "[90m";     // light gray (file path)
  
  return `${gy}${t}${r} ${c}[vite]${r} ${dg}(client)${r} ${g}${action}${r} ${lg}${file}${r}`;
}

function parseMetadata(layoutContent) {
  const metaTags = {
    title: 'Bini.js App',
    description: 'Modern React application built with Bini.js',
    keywords: '',
    viewport: 'width=device-width, initial-scale=1.0',
    openGraph: {},
    twitter: {},
    icons: {}
  };

  try {
    // Extract the entire metadata object
    const metadataMatch = layoutContent.match(/export\s+const\s+metadata\s*=\s*({[\s\S]*?})(?=\s*export|\s*function|\s*const|\s*$)/);
    
    if (metadataMatch) {
      const metadataStr = metadataMatch[1];
      
      // Helper function to extract properties
      const extractString = (str, prop) => {
        const regex = new RegExp(`${prop}:\\s*['"]([^'"]+)['"]`, 'i');
        const match = str.match(regex);
        return match ? match[1] : null;
      };

      const extractArray = (str, prop) => {
        const regex = new RegExp(`${prop}:\\s*\\[([^\\]]+)\\]`, 'i');
        const match = str.match(regex);
        if (match) {
          // Simple array parsing - extract quoted values
          const arrayContent = match[1];
          const items = arrayContent.match(/['"]([^'"]+)['"]/g) || [];
          return items.map(item => item.replace(/['"]/g, ''));
        }
        return null;
      };

      const extractObject = (str, prop) => {
        const regex = new RegExp(`${prop}:\\s*{([^}]+)}`, 'i');
        const match = str.match(regex);
        if (match) {
          const objContent = match[1];
          return {
            title: extractString(objContent, 'title'),
            description: extractString(objContent, 'description'),
            url: extractString(objContent, 'url'),
            images: extractArray(objContent, 'images') || []
          };
        }
        return null;
      };

      // Basic metadata
      metaTags.title = extractString(metadataStr, 'title') || metaTags.title;
      metaTags.description = extractString(metadataStr, 'description') || metaTags.description;
      
      // Keywords (array)
      const keywordsArray = extractArray(metadataStr, 'keywords');
      if (keywordsArray) {
        metaTags.keywords = keywordsArray.join(', ');
      }

      // Authors
      const authorsMatch = metadataStr.match(/authors:\s*\[\s*{\s*name:\s*['"]([^'"]+)['"]/);
      if (authorsMatch) metaTags.author = authorsMatch[1];

      // Viewport
      metaTags.viewport = extractString(metadataStr, 'viewport') || metaTags.viewport;

      // OpenGraph
      const og = extractObject(metadataStr, 'openGraph');
      if (og) metaTags.openGraph = og;

      // Twitter
      const twitter = extractObject(metadataStr, 'twitter');
      if (twitter) metaTags.twitter = twitter;

      // Icons
      const iconsMatch = metadataStr.match(/icons:\s*{([^}]+)}/);
      if (iconsMatch) {
        const iconsContent = iconsMatch[1];
        metaTags.icons = {
          icon: extractString(iconsContent, 'icon'),
          shortcut: extractString(iconsContent, 'shortcut'),
          apple: extractString(iconsContent, 'apple')
        };
      }

    }
  } catch (error) {
    console.warn('⚠️ Metadata parsing error:', error.message);
  }

  return metaTags;
}

function getCurrentMetadata() {
  const layoutPath = path.join(process.cwd(), 'src/app/layout.tsx');
  const layoutPathJS = path.join(process.cwd(), 'src/app/layout.jsx');
  
  try {
    let layoutContent = '';
    if (fs.existsSync(layoutPath)) {
      layoutContent = fs.readFileSync(layoutPath, 'utf-8');
    } else if (fs.existsSync(layoutPathJS)) {
      layoutContent = fs.readFileSync(layoutPathJS, 'utf-8');
    } else {
      return {};
    }
    
    return parseMetadata(layoutContent);
  } catch (error) {
    console.warn('⚠️ Could not read layout file:', error.message);
    return {};
  }
}

export function biniSSRPlugin() {
  return {
    name: 'bini-ssr-plugin',
    
    configureServer(server) {
      const layoutPath = path.join(process.cwd(), 'src/app/layout.tsx');
      const layoutPathJS = path.join(process.cwd(), 'src/app/layout.jsx');
      
      const layoutFiles = [layoutPath, layoutPathJS].filter(fs.existsSync);
      
      layoutFiles.forEach(layoutFile => {
        server.watcher.add(layoutFile);
        
        server.watcher.on('change', (file) => {
          if (layoutFiles.includes(file)) {
            // Show CLI notification when layout changes
            console.log(formatViteLog('src/app/layout.tsx', 'page reload'));
            
            setTimeout(() => {
              server.ws.send({
                type: 'full-reload',
                path: '*'
              });
            }, 100);
          }
        });
      });
    },
    
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const metaTags = getCurrentMetadata();
        
        let metaTagsHTML = '';
        
        // Basic meta tags
        metaTagsHTML += `
    <meta charset="UTF-8" />
    <meta name="viewport" content="${metaTags.viewport}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon.png" type="image/png" />
    <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
    <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
    <link rel="icon" href="/favicon-64x64.png" type="image/png" sizes="64x64" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />`;
        
        // Title
        metaTagsHTML += `
    <title>${metaTags.title}</title>`;
        
        // Basic meta
        if (metaTags.description) {
          metaTagsHTML += `
    <meta name="description" content="${metaTags.description}" />`;
        }
        
        if (metaTags.keywords) {
          metaTagsHTML += `
    <meta name="keywords" content="${metaTags.keywords}" />`;
        }
        
        if (metaTags.author) {
          metaTagsHTML += `
    <meta name="author" content="${metaTags.author}" />`;
        }
        
        // OpenGraph meta tags
        if (metaTags.openGraph && metaTags.openGraph.title) {
          metaTagsHTML += `
    <meta property="og:title" content="${metaTags.openGraph.title}" />
    <meta property="og:description" content="${metaTags.openGraph.description || metaTags.description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${metaTags.openGraph.url || 'https://bini.js.org'}" />
    <meta property="og:site_name" content="${metaTags.openGraph.title}" />`;
          
          if (metaTags.openGraph.images && metaTags.openGraph.images.length > 0) {
            metaTagsHTML += `
    <meta property="og:image" content="${metaTags.openGraph.images[0]}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${metaTags.openGraph.title}" />`;
          }
        }
        
        // Twitter Card meta tags
        if (metaTags.twitter && metaTags.twitter.title) {
          metaTagsHTML += `
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${metaTags.twitter.title}" />
    <meta name="twitter:description" content="${metaTags.twitter.description || metaTags.description}" />
    <meta name="twitter:creator" content="${metaTags.twitter.creator || '@binidu01'}" />`;
          
          if (metaTags.twitter.images && metaTags.twitter.images.length > 0) {
            metaTagsHTML += `
    <meta name="twitter:image" content="${metaTags.twitter.images[0]}" />`;
          }
        }
        
        // Additional meta tags for better SEO
        metaTagsHTML += `
    <meta name="theme-color" content="#00CFFF" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${metaTags.openGraph?.url || 'https://bini.js.org'}" />`;
        
        // Bini.js runtime
        metaTagsHTML += `
    
    <!-- Bini.js runtime -->
    <script>
      window.__BINI_RUNTIME__ = { version: '${BINIJS_VERSION}' };
    </script>`;
        
        return html.replace('<!-- BINI_META_TAGS -->', metaTagsHTML);
      }
    },
    
    buildStart() {
      // Ensure favicon files are available
      const publicDir = path.join(process.cwd(), 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
    },
    
    handleHotUpdate({ server, file }) {
      if (file.endsWith('layout.tsx') || file.endsWith('layout.jsx')) {
        // Remove the console.log from here to avoid duplicate notifications
        // The notification is already shown in configureServer watcher
        
        setTimeout(() => {
          server.ws.send({
            type: 'full-reload',
            path: '*'
          });
        }, 50);
        
        return [];
      }
    }
  }
}