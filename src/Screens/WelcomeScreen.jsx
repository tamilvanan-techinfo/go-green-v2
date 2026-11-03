import React from 'react'
import background from "../assets/images/welcome.jpeg"

function WelcomeScreen() {
  return (
    <div
      style={{
        backgroundImage: `url(${background})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        width: '100vw',
        height: '100vh',
      }}
    >
      {/* WelcomeScreen */}
    </div>
  )
}

export default WelcomeScreen