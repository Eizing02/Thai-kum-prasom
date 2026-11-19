import { createRoot } from 'react-dom/client'
import '@fontsource-variable/noto-sans-thai'
import './styles.css'
import './tracking/tracking.css'
import App from './app/App'

createRoot(document.getElementById('root')!).render(<App />)
