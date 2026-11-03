import React, { useEffect } from "react";
import { CssBaseline } from "@mui/material";
import { HashRouter, Routes, Route } from "react-router-dom";

import IndividualParticipent from "./Screens/IndividualParticipent";
import ParticipentScreen from "./Screens/ParticipentScreen";
import MotiveScreen from "./Screens/MotiveScreen";
import WelcomeScreen from "./Screens/WelcomeScreen";
import GroupParticipent from "./Screens/GroupParticipent";
import LivePowerLineChart from "./Screens/LivePowerChart"
import { SocketProvider } from "./context/SocketContext";
import FreeText from "./Screens/FreeText";
import LiveBarChart from "./Screens/LiveBarChart";
import CycleHistory from "./Screens/CycleHistory";
import CombinedView from "./Screens/CombinedView";
import ParticipantRank from "./Screens/ParticipantRank";
import {WindowProvider} from "./context/WindowContext";
export default function App() {




  return (
    <HashRouter>
      <SocketProvider>
        <WindowProvider>
        <CssBaseline />

        <Routes>
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/participant-rank" element={<ParticipantRank />} />
          <Route path="/combined-view" element={<CombinedView />} />
          <Route path="/individual" element={<IndividualParticipent />} />
          <Route path="/participants" element={<ParticipentScreen />} />
          <Route path="/group-participants" element={<GroupParticipent />} />
          <Route path="/welcome" element={<WelcomeScreen />} />
          <Route path="/motive" element={<MotiveScreen />} />
          <Route path="/player-analysis" element={<LivePowerLineChart />} />
          <Route path="/free-text" element={<FreeText />} />
          <Route path="/live-barchart" element={<LiveBarChart />} />
        </Routes>
        </WindowProvider>
      </SocketProvider>
    </HashRouter>
  );
}