import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
// import './App.css'
import Landing from './components/LandingPage.jsx';
import Home from './components/Home.jsx';
import Interview from './components/Interview.jsx';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/home" element={<Home />} />
        <Route path="/interview" element={<Interview />} />
      </Routes>
    </>
  )
}

export default App
