import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const [username, setUsername] = useState('');
  const [room, setRoom] = useState('');
  const navigate = useNavigate();

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRoom(code);
  };

  const handleEnter = () => {
    if (username && room) {
      navigate(`/room/${room}`, { state: { username } });
    }
  };

  return (
    <div className="bg-black text-green-400 min-h-screen flex flex-col justify-center items-center font-mono px-4">
      <h1 className="text-xl mb-6 border-b border-green-500 pb-2">
        ~ AbyssChat Terminal ~
      </h1>

      <div className="flex flex-col w-full max-w-md gap-3">
        <label className="text-green-300">
          &gt; Enter your name:
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full mt-1 px-2 py-1 bg-black border border-green-500 text-green-300 focus:outline-none"
            placeholder="Anonymous123"
          />
        </label>

        <label className="text-green-300">
          &gt; Enter Room Code or
          <span
            className="underline cursor-pointer ml-1 hover:text-green-200"
            onClick={generateRoomCode}
          >
            generate
          </span>
          :
          <input
            type="text"
            value={room}
            onChange={(e) => setRoom(e.target.value.toUpperCase())}
            className="w-full mt-1 px-2 py-1 bg-black border border-green-500 text-green-300 focus:outline-none"
            placeholder="e.g. 9ZS7KH"
          />
        </label>

        <button
          onClick={handleEnter}
          className="bg-green-600 hover:bg-green-700 text-black py-2 mt-4 font-bold"
        >
          Connect
        </button>
      </div>
    </div>
  );
}
