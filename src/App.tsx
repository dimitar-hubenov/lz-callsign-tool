import { HashRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import MainPage from './pages/MainPage';
import DiffPage from './pages/DiffPage';
import "./index.css";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<MainPage />} />
          <Route path="/diff" element={<DiffPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
