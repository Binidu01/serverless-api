/// <reference types="bini/client" />
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production'
      VITE_APP_NAME: string
      VITE_APP_URL: string
    }
  }
}
export {}