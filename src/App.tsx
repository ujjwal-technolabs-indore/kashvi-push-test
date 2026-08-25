import { useState } from "react";
import Shell from "./components/Shell";
import HomeScreen from "./components/HomeScreen";
import JoinScreen from "./components/JoinScreen";
import RoomScreen from "./components/RoomScreen";
import { generateRoomCode } from "./lib/room";

type View = "home" | "join" | "room";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [roomCode, setRoomCode] = useState<string>("");
  const [hostMode, setHostMode] = useState<boolean>(false);

  const handleCreate = () => {
    setRoomCode(generateRoomCode());
    setHostMode(true);
    setView("room");
  };

  const handleJoin = (code: string) => {
    setRoomCode(code);
    setHostMode(false);
    setView("room");
  };

  const handleLeave = () => {
    setRoomCode("");
    setHostMode(false);
    setView("home");
  };

  return (
    <Shell>
      {view === "home" && (
        <HomeScreen onCreate={handleCreate} onJoin={() => setView("join")} />
      )}
      {view === "join" && (
        <JoinScreen onBack={() => setView("home")} onJoin={handleJoin} />
      )}
      {view === "room" && (
        <RoomScreen code={roomCode} isHost={hostMode} onLeave={handleLeave} />
      )}
    </Shell>
  );
}