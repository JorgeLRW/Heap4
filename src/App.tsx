import React, { useState, useEffect } from 'react';
import { SaaSLayout } from './components/SaaSLayout';
import { RecoveryDrawer } from './components/RecoveryDrawer';
import { DeveloperRepairPanel } from './components/DeveloperRepairPanel';
import { Intent } from './client/heap/intentTypes';
import { initializeWebMCPTools } from './client/webmcp/registerTools';
import { intentRuntime, AgentUiFocus } from './client/heap/intentRuntime';

export const App: React.FC = () => {
  const [activeDrawerCapsule, setActiveDrawerCapsule] = useState<Intent | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRepairPanelOpen, setIsRepairPanelOpen] = useState(false);
  const [webMcpAvailable, setWebMcpAvailable] = useState<boolean | null>(null);
  const [agentFocus, setAgentFocus] = useState<AgentUiFocus | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await intentRuntime.hydrateFromServer();
        await initializeWebMCPTools();
        if (active) setWebMcpAvailable(true);
      } catch (error) {
        console.warn('[Heap 4] Native WebMCP registration unavailable:', error);
        if (active) setWebMcpAvailable(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // A WebMCP tool call moves the human UI to the surface the agent is acting on.
  useEffect(
    () =>
      intentRuntime.subscribeAgentUiFocus((focus) => {
        if (focus.target === 'repair_panel') {
          setIsRepairPanelOpen(true);
          return;
        }
        const intent = intentRuntime.getIntent(focus.intentId);
        if (intent) setActiveDrawerCapsule(intent);
        setAgentFocus(focus);
        setIsDrawerOpen(true);
      }),
    []
  );

  const handleOpenRecoveryDrawer = (capsule: Intent) => {
    setActiveDrawerCapsule(capsule);
    setIsDrawerOpen(true);
  };
  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const handleOpenRepairPanel = () => {
    setIsRepairPanelOpen(true);
  };

  const handleCloseRepairPanel = () => {
    setIsRepairPanelOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Main SaaS Layout (§1) */}
      <SaaSLayout
        onOpenRecoveryDrawer={handleOpenRecoveryDrawer}
        onOpenRepairPanel={handleOpenRepairPanel}
      />

      {/* Recovery Drawer (§6) */}
      <RecoveryDrawer
        capsule={activeDrawerCapsule}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onOpenRepairPanel={handleOpenRepairPanel}
        agentFocus={agentFocus}
      />

      {/* Demo Developer Repair Panel (§8) */}
      <DeveloperRepairPanel
        isOpen={isRepairPanelOpen}
        onClose={handleCloseRepairPanel}
      />

      {webMcpAvailable === false && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[calc(100%-2rem)] rounded-xl border border-amber-500/40 bg-amber-950/95 px-4 py-3 text-xs text-amber-100 shadow-2xl">
          Native WebMCP is not available in this browser. The application remains usable, but agent discovery is disabled—enable the Chrome WebMCP testing flag or open the live page in ChatGPT’s in-app browser.
        </div>
      )}
    </div>
  );
};
