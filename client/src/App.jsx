import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RoomForm from './components/RoomForm';
import Room from './pages/Room';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RoomForm />} />
          <Route path="/room/:code" element={<Room />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

