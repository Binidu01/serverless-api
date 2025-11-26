const BINIJS_VERSION = "9.1.5";
import path from 'path';
import fs from 'fs';
import { displayBiniStartup } from '../env-checker.js';

function getRoutes() {
  const appDir = path.join(process.cwd(), 'src/app');
  const routes = [];
  
  if (!fs.existsSync(appDir)) return routes;
  
  function scanDir(dir, baseRoute = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const pageFiles = ['page.tsx', 'page.jsx', 'page.ts', 'page.js'];
        const hasPage = pageFiles.some(f => fs.existsSync(path.join(fullPath, f)));
        
        if (hasPage) {
          const routePath = baseRoute + '/' + entry.name;
          routes.push(routePath === '/' ? '/' : routePath);
        }
        
        scanDir(fullPath, baseRoute + '/' + entry.name);
      }
    }
  }
  
  if (fs.existsSync(path.join(appDir, 'page.tsx')) || fs.existsSync(path.join(appDir, 'page.jsx'))) {
    routes.push('/');
  }
  
  scanDir(appDir);
  return routes.sort();
}

function validateProjectStructure() {
  const srcPath = path.join(process.cwd(), 'src');
  const appPath = path.join(process.cwd(), 'src/app');
  
  if (!fs.existsSync(srcPath)) {
    console.log('❌ src directory not found');
    return false;
  }
  
  if (!fs.existsSync(appPath)) {
    console.log('❌ src/app directory not found');
    return false;
  }
  
  return true;
}

export function biniBadgePlugin() {
  let port = 3000;
  let routes = [];
  
  return {
    name: 'bini-badge-injector',
    
    configResolved(config) {
      port = config.server?.port || 3000;
      routes = getRoutes();
    },
    
    configureServer(server) {
      if (!validateProjectStructure()) {
        console.log('💡 Check your project structure and try again');
        process.exit(1);
      }
      
      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          displayBiniStartup({
            port: port,
            mode: 'dev',
            isDev: true
          });
        }, 100);
      });
      
      const appDir = path.join(process.cwd(), 'src/app');
      if (fs.existsSync(appDir)) {
        server.watcher.add(appDir);
        
        server.watcher.on('add', (file) => {
          if (/page\.(tsx|jsx|ts|js)$/.test(file)) {
            routes = getRoutes();
          }
        });
        
        server.watcher.on('unlink', (file) => {
          if (/page\.(tsx|jsx|ts|js)$/.test(file)) {
            routes = getRoutes();
          }
        });
      }
    },
    
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (process.env.NODE_ENV !== 'production' && !process.env.DISABLE_BADGE) {
          const routesJson = JSON.stringify(routes);
          const versionInfo = BINIJS_VERSION;
          
          const badgeScript = `
            <style>
              .bini-circular-badge {
                position: fixed;
                bottom: 24px;
                left: 24px;
                width: 60px;
                height: 60px;
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                cursor: pointer;
                border-radius: 50%;
                background: #000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: transform 0.3s ease;
              }
              
              .bini-circular-badge:hover {
                transform: scale(1.05);
              }
              
              .bini-badge-svg {
                width: 28px;
                height: auto;
              }
              
              .bini-badge-path {
                fill: url(#biniBadgeGradient);
              }
              
              .bini-loading-svg {
                width: 28px;
                height: auto;
              }
              
              .bini-badge-menu {
                position: fixed;
                bottom: 90px;
                left: 24px;
                background: #111;
                color: #fff;
                border-radius: 12px;
                padding: 0;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                z-index: 9998;
                max-width: 300px;
                display: none;
                overflow: hidden;
              }
              
              .bini-badge-menu.visible {
                display: block;
              }
              
              .bini-menu-section {
                padding: 12px 16px;
                border-bottom: 1px solid #333;
                font-size: 12px;
              }
              
              .bini-menu-section:last-child {
                border-bottom: none;
              }
              
              .bini-menu-label {
                color: #888;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
              }
              
              .bini-menu-value {
                color: #0fb;
                font-family: 'Monaco', 'Courier New', monospace;
                word-break: break-all;
              }
              
              .bini-menu-routes {
                display: flex;
                flex-direction: column;
                gap: 4px;
                max-height: 200px;
                overflow-y: auto;
              }
              
              .bini-menu-route {
                color: #0fb;
                font-family: 'Monaco', 'Courier New', monospace;
                font-size: 11px;
                padding: 4px 0;
              }
              
              .bini-circular-badge.loading {
                animation: biniLoadingPulse 1.5s ease-out forwards;
              }

              @keyframes biniLoadingPulse {
                from {
                  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                to {
                  box-shadow: 0 0 0 15px transparent, 0 4px 12px rgba(0,0,0,0.3);
                }
              }

              .bini-circular-badge.loading::before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: 50%;
                background: #000;
                animation: biniCircleExpand 1.5s ease-out forwards;
              }

              @keyframes biniCircleExpand {
                from {
                  clip-path: circle(0% at 50% 50%);
                }
                to {
                  clip-path: circle(100% at 50% 50%);
                }
              }

              .bini-badge-svg {
                transition: opacity 0.3s ease;
              }

              .bini-circular-badge.loading .bini-badge-svg {
                opacity: 0;
              }

              .bini-loading-path {
                fill: none;
                stroke: url(#biniLoadingGradient);
                stroke-width: 1.2;
                stroke-linecap: round;
                stroke-linejoin: round;
                stroke-dasharray: 300;
                stroke-dashoffset: 300;
              }

              .bini-circular-badge.loading .bini-loading-path {
                animation: biniDrawPath 1.5s ease-out 0.3s forwards;
              }

              @keyframes biniDrawPath {
                from {
                  stroke-dashoffset: 300;
                }
                to {
                  stroke-dashoffset: 0;
                }
              }
              
              @media (max-width: 640px) {
                .bini-circular-badge {
                  bottom: 16px;
                  left: 16px;
                  width: 50px;
                  height: 50px;
                }
                
                .bini-badge-svg {
                  width: 24px;
                }
                
                .bini-badge-menu {
                  bottom: 66px;
                  left: 16px;
                  max-width: 280px;
                }
              }
            </style>

            <div class="bini-circular-badge" id="bini-circular-badge">
              <svg class="bini-badge-svg" width="22" height="31" viewBox="0 0 22 31" fill="none">
                <path class="bini-badge-path" d="M8.04688 29.9219V24.8047C9.1276 25.4948 10.2734 25.8398 11.4844 25.8398C12.5651 25.8398 13.4245 25.5013 14.0625 24.8242C14.7135 24.1341 15.0391 23.1901 15.0391 21.9922C15.0391 20.4818 14.4596 19.2904 13.3008 18.418C12.1419 17.5326 10.5078 17.0573 8.39844 16.9922V12.6758C9.84375 12.5716 10.9635 12.1289 11.7578 11.3477C12.5651 10.5664 12.9688 9.53125 12.9688 8.24219C12.9688 7.14844 12.6758 6.28906 12.0898 5.66406C11.5169 5.03906 10.7422 4.72656 9.76562 4.72656C7.36979 4.72656 6.17188 6.32161 6.17188 9.51172V30.0781H0V9.58984C0 6.6862 0.891927 4.36198 2.67578 2.61719C4.45964 0.872396 6.9401 0 10.1172 0C12.9427 0 15.1758 0.716146 16.8164 2.14844C18.457 3.56771 19.2773 5.39714 19.2773 7.63672C19.2773 9.22526 18.8086 10.6185 17.8711 11.8164C16.9466 13.0143 15.7487 13.8346 14.2773 14.2773V14.3555C19.0039 15.2539 21.3672 17.8516 21.3672 22.1484C21.3672 24.4922 20.5404 26.4844 18.8867 28.125C17.2461 29.7526 15.0195 30.5664 12.207 30.5664C10.8398 30.5664 9.45312 30.3516 8.04688 29.9219Z"/>
                <defs>
                  <linearGradient id="biniBadgeGradient" x1="9.96094" y1="-12.9219" x2="9.96094" y2="40.0781" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#00CFFF"/>
                    <stop offset="1" stop-color="#0077FF"/>
                  </linearGradient>
                </defs>
              </svg>
              <svg class="bini-loading-svg" width="22" height="31" viewBox="0 0 22 31" fill="none" style="position: absolute;">
                <path class="bini-loading-path" d="M8.04688 29.9219V24.8047C9.1276 25.4948 10.2734 25.8398 11.4844 25.8398C12.5651 25.8398 13.4245 25.5013 14.0625 24.8242C14.7135 24.1341 15.0391 23.1901 15.0391 21.9922C15.0391 20.4818 14.4596 19.2904 13.3008 18.418C12.1419 17.5326 10.5078 17.0573 8.39844 16.9922V12.6758C9.84375 12.5716 10.9635 12.1289 11.7578 11.3477C12.5651 10.5664 12.9688 9.53125 12.9688 8.24219C12.9688 7.14844 12.6758 6.28906 12.0898 5.66406C11.5169 5.03906 10.7422 4.72656 9.76562 4.72656C7.36979 4.72656 6.17188 6.32161 6.17188 9.51172V30.0781H0V9.58984C0 6.6862 0.891927 4.36198 2.67578 2.61719C4.45964 0.872396 6.9401 0 10.1172 0C12.9427 0 15.1758 0.716146 16.8164 2.14844C18.457 3.56771 19.2773 5.39714 19.2773 7.63672C19.2773 9.22526 18.8086 10.6185 17.8711 11.8164C16.9466 13.0143 15.7487 13.8346 14.2773 14.2773V14.3555C19.0039 15.2539 21.3672 17.8516 21.3672 22.1484C21.3672 24.4922 20.5404 26.4844 18.8867 28.125C17.2461 29.7526 15.0195 30.5664 12.207 30.5664C10.8398 30.5664 9.45312 30.3516 8.04688 29.9219Z"/>
                <defs>
                  <linearGradient id="biniLoadingGradient" x1="9.96094" y1="-12.9219" x2="9.96094" y2="40.0781" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#00CFFF"/>
                    <stop offset="1" stop-color="#0077FF"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            
            <div class="bini-badge-menu" id="bini-badge-menu">
              <div class="bini-menu-section">
                <div class="bini-menu-label">📁 Routes (${routes.length})</div>
                <div class="bini-menu-routes">
                  ${routes.map(route => `<div class="bini-menu-route">${route}</div>`).join('')}
                </div>
              </div>
              
              <div class="bini-menu-section">
                <div class="bini-menu-label">⚡ Status</div>
                <div class="bini-menu-value">✓ Ready</div>
              </div>
              
              <div class="bini-menu-section">
                <div class="bini-menu-label">🚀 Version</div>
                <div class="bini-menu-value">v${versionInfo}</div>
              </div>
            </div>
            
            <script>
              window.BiniBadge = (function() {
                const badge = document.getElementById('bini-circular-badge');
                const menu = document.getElementById('bini-badge-menu');
                const loadingPath = badge.querySelector('.bini-loading-path');
                
                let pageLoaded = false;
                let firstAnimationComplete = false;
                
                const ANIMATION_DURATION = 1500;
                const RESTART_DELAY = 300;
                
                badge.addEventListener('click', function(e) {
                  e.stopPropagation();
                  menu.classList.toggle('visible');
                });
                
                document.addEventListener('click', function(e) {
                  if (!badge.contains(e.target) && !menu.contains(e.target)) {
                    menu.classList.remove('visible');
                  }
                });
                
                loadingPath.addEventListener('animationend', function(e) {
                  if (e.animationName === 'biniDrawPath' || e.animationName === 'biniCircleExpand') {
                    firstAnimationComplete = true;
                    
                    if (!pageLoaded) {
                      restartAnimation();
                    } else {
                      stopAnimation();
                    }
                  }
                });
                
                function restartAnimation() {
                  badge.classList.remove('loading');
                  
                  setTimeout(function() {
                    badge.classList.add('loading');
                  }, RESTART_DELAY);
                }
                
                function stopAnimation() {
                  badge.classList.remove('loading');
                }
                
                function startAnimation() {
                  badge.classList.add('loading');
                }
                
                function markPageLoaded() {
                  pageLoaded = true;
                  if (firstAnimationComplete) {
                    stopAnimation();
                  }
                }
                
                startAnimation();
                
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', markPageLoaded);
                  window.addEventListener('load', markPageLoaded);
                } else {
                  markPageLoaded();
                }
                
                return {
                  show: startAnimation,
                  hide: stopAnimation,
                  restart: restartAnimation
                };
              })();
              
              window.__BINI_ROUTES__ = ${routesJson};
              window.__BINI_VERSION__ = '${versionInfo}';
            </script>
          `;
          
          return html.replace('</body>', badgeScript + '</body>');
        }
        return html;
      }
    }
  }
}