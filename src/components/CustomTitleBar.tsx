import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { FairyAssistantHud } from './FairyAssistantHud';
import { fairyClient } from '../services/fairyClient';
import type { FairyLogEntry } from '../shared/types';

interface CustomTitleBarProps {
  activeTheme: string;
  logs: FairyLogEntry[];
  unseenActivity: number;
  onActivityOpened: () => void;
  onSelectMod: (modUuid: string) => void;
  onViewActivity: () => void;
  isElectron: boolean;
  /** Optional item shown before the activity bell (e.g. "Restart to update"). */
  extra?: React.ReactNode;
}

/** Frameless window chrome: brand on the left, activity + window controls on the right. */
export const CustomTitleBar: React.FC<CustomTitleBarProps> = ({
  activeTheme,
  logs,
  unseenActivity,
  onActivityOpened,
  onSelectMod,
  onViewActivity,
  isElectron,
  extra,
}) => (
  <header className="titlebar titlebar-drag">
    <div className="titlebar__brand">
      <span className="wordmark" aria-label="ProxyLaunch">
        <span className="wordmark__bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="wordmark__proxy">Proxy</span>
        <span className="wordmark__launch">
          <span>Launch</span>
        </span>
      </span>
    </div>
    <div className="spacer" />
    <div className="titlebar__actions">
      {extra}
      <FairyAssistantHud
        logs={logs}
        unseenCount={unseenActivity}
        onOpened={onActivityOpened}
        onSelectMod={onSelectMod}
        onViewAll={onViewActivity}
      />
    </div>
    {isElectron ? (
      <div className="wincontrols titlebar-no-drag">
        <button onClick={() => fairyClient.windowMinimize()} aria-label="Minimize" title="Minimize">
          <Minus />
        </button>
        <button onClick={() => fairyClient.windowToggleMaximize()} aria-label="Maximize" title="Maximize / restore">
          <Square style={{ width: 12, height: 12 }} />
        </button>
        <button className="is-close" onClick={() => fairyClient.windowClose()} aria-label="Close" title="Close">
          <X />
        </button>
      </div>
    ) : (
      <div style={{ width: 12 }} />
    )}
  </header>
);
