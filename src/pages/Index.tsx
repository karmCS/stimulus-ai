import { useState } from "react";
import ChatSidebar from "@/components/ChatSidebar";
import ChatMain from "@/components/ChatMain";
import FilmGrain from "@/components/FilmGrain";

const Index = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeConversation, setActiveConversation] = useState("1");

  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  return (
    <>
      <FilmGrain />
      <div className="flex h-screen overflow-hidden">
        <ChatSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          activeId={activeConversation}
          onSelect={setActiveConversation}
        />
        <ChatMain
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
      </div>
    </>
  );
};

export default Index;
