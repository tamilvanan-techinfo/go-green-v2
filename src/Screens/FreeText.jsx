import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box, Typography, keyframes } from '@mui/material'
import SocketContext from '../context/SocketContext'
import axios from 'axios'
import WebFont from 'webfontloader'
import url from "../../config.json"
const API_ORIGIN = url.api

const enterText = keyframes`
  0% {
    opacity: 0;
    transform: translateY(24px) scale(0.94);
    filter: blur(6px);
  }
  60% {
    opacity: 1;
    filter: blur(0px);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0px);
  }
`

const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 600 // raised ceiling so short text can grow to fill large displays
const LINE_HEIGHT = 1.35

// Known Google Fonts this app offers in the publisher's font picker. Kept
// here so we can tell "this is a Google Font that needs loading" apart
// from a system/inherit value, without having to load the whole catalog
// up front — only the one font actually in use gets requested.
const GOOGLE_FONTS = [
  'Roboto',
  // Sans-serif
  'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Inter',
  'Nunito', 'Raleway', 'Work Sans', 'Rubik', 'Manrope', 'Barlow',
  // Serif
  'Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Cormorant Garamond',
  'Libre Baskerville', 'Crimson Text',
  // Monospace
  'Roboto Mono', 'Source Code Pro', 'JetBrains Mono', 'IBM Plex Mono', 'Space Mono',
  // Display / decorative
  'Bebas Neue', 'Anton', 'Oswald', 'Righteous', 'Alfa Slab One', 'Bungee',
  'Passion One', 'Fjalla One',
  // Handwriting / script
  'Pacifico', 'Dancing Script', 'Great Vibes', 'Caveat', 'Sacramento',
  'Shadows Into Light', 'Satisfy',
]

// The style publisher sends fontFamily as something like
// '"Poppins", sans-serif' or 'inherit'. Pull out just the family name so
// it can be matched against GOOGLE_FONTS and requested from Google's CDN.
function extractFontName(fontFamily) {
  if (!fontFamily || fontFamily === 'inherit') return null
  const match = fontFamily.match(/^"?([^",]+)"?/)
  return match ? match[1].trim() : null
}

/**
 * Loads a single Google Font on demand and only once per family for the
 * page's lifetime — tracked in a module-level Set so repeated free-text
 * updates using the same font don't re-request it, and switching between
 * a handful of fonts over a session doesn't leak duplicate <link> tags
 * beyond one per distinct family actually used.
 */
const loadedFontsCache = new Set()
function useGoogleFont(fontFamily) {
  const [ready, setReady] = useState(true)

  useEffect(() => {
    const fontName = extractFontName(fontFamily)
    if (!fontName || !GOOGLE_FONTS.includes(fontName)) {
      setReady(true)
      return
    }
    if (loadedFontsCache.has(fontName)) {
      setReady(true)
      return
    }

    setReady(false)
    WebFont.load({
      google: { families: [fontName] },
      active: () => {
        loadedFontsCache.add(fontName)
        setReady(true)
      },
      inactive: () => {
        // Still mark as "loaded" so we don't retry forever on a bad name —
        // the browser will just fall back to its default font.
        loadedFontsCache.add(fontName)
        setReady(true)
      },
    })
  }, [fontFamily])

  return ready
}

/**
 * Measures the available box and the text content, then binary-searches
 * for the largest font size that still fits inside the container on both
 * axes. Re-runs whenever the text changes or the container is resized
 * (window resize, screen rotation, dev tools open/close, etc.), so the
 * content always fills the screen edge-to-edge regardless of the display's
 * physical size or how much text was published.
 */
function useAutoFitFontSize(text, { padding = 0, maxFontSize = MAX_FONT_SIZE } = {}) {
  const containerRef = useRef(null)
  const measureRef = useRef(null)
  const [fontSize, setFontSize] = useState(MIN_FONT_SIZE)
  const frame = useRef(null)

  const recalc = () => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return

    const availableWidth = container.clientWidth - padding * 2
    const availableHeight = container.clientHeight - padding * 2
    if (availableWidth <= 0 || availableHeight <= 0) return

    let low = MIN_FONT_SIZE
    let high = Math.max(maxFontSize, MIN_FONT_SIZE)
    let best = MIN_FONT_SIZE

    for (let i = 0; i < 14; i++) {
      const mid = Math.floor((low + high) / 2)
      measure.style.fontSize = `${mid}px`
      measure.style.width = `${availableWidth}px`
      const fitsWidth = measure.scrollWidth <= availableWidth + 1
      const fitsHeight = measure.scrollHeight <= availableHeight

      if (fitsWidth && fitsHeight) {
        best = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
      if (low > high) break
    }

    setFontSize(best)
  }

  const scheduleRecalc = () => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(recalc)
  }

  useLayoutEffect(() => {
    scheduleRecalc()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, maxFontSize])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', scheduleRecalc)
      return () => window.removeEventListener('resize', scheduleRecalc)
    }
    const observer = new ResizeObserver(scheduleRecalc)
    observer.observe(container)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => frame.current && cancelAnimationFrame(frame.current), [])

  return { containerRef, measureRef, fontSize }
}

// Django's media URLs come back relative (e.g. "/media/free_text_bg_images/…").
// Prefix them with the API origin so the browser resolves them against the
// backend host instead of the frontend's own dev server / display window.
function resolveMediaUrl(url) {
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `${API_ORIGIN}${url}`
}

function FreeText() {
  // freeText is the full payload pushed from the socket / loaded from the
  // API: { content, style: { fontSize, color, fontFamily, bgColor }, bg_image_url }
  const { freeText, setFreeText } = useContext(SocketContext)
  const [updatedAt, setUpdatedAt] = useState(null)
  const prevContent = useRef(null)

  const content = freeText?.content || ''
  const style = freeText?.style || {}
  const bgImageUrl = resolveMediaUrl(freeText?.bg_image_url)

  const hasText = Boolean(content && content.trim())

  // Ensure the requested font is actually loaded before we rely on it —
  // re-runs the recalc below once the font swaps in, so the auto-fit
  // measurement reflects the real glyph metrics, not the fallback font's.
  const fontReady = useGoogleFont(style.fontFamily)

  // Font size always auto-fits to the screen — the published fontSize is
  // treated as a starting point/style choice, not a hard ceiling, so the
  // text scales up or down to fill whatever display it lands on.
  const { containerRef, measureRef, fontSize } = useAutoFitFontSize(
    fontReady ? content : '', // avoid measuring against the fallback font mid-swap
    {
      padding: 64,
      maxFontSize: MAX_FONT_SIZE,
    }
  )

  useEffect(() => {
    getFreetext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (content !== prevContent.current) {
      setUpdatedAt(new Date())
      prevContent.current = content
    }
  }, [content])

  const getFreetext = async () => {
    try {
      const response = await axios.get(`${API_ORIGIN}/api/admin/free-text/`)
      const data = response.data.data
      console.log('Fetched free text:', data)
      setFreeText({
        content: data.text,
        style: data.style || {},
        bg_image_url: data.bg_image_url,
      })
    } catch (e) {
      console.error('Failed to load free text', e)
    }
  }

  console.log('freetext-----', freeText)
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: style.bgColor || 'background.default',
        backgroundImage: bgImageUrl ? `url(${bgImageUrl})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        overflow: 'hidden',
        transition: 'background-color 0.4s ease',
      }}
    >
      {/* Fills the entire screen — no CSS padding here, since the hook's
          `padding` option already reserves the visual margin during
          measurement. Applying both would shrink text more than needed. */}
      <Box
        ref={containerRef}
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {hasText && fontReady ? (
          <Typography
            key={content}
            sx={{
              color: style.color || 'text.primary',
              fontFamily: style.fontFamily || 'inherit',
              fontWeight: 700,
              textAlign: 'center',
              lineHeight: LINE_HEIGHT,
              letterSpacing: '0em',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxWidth: 'calc(100% - 128px)',
              fontSize,
              textShadow: bgImageUrl ? '0 2px 10px rgba(0,0,0,0.6)' : 'none',
              animation: `${enterText} 0.6s cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            {content}
          </Typography>
        ) : hasText ? (
          // Font is still loading — render invisibly at final layout so
          // there's no flash of unstyled/fallback-font text.
          <Typography sx={{ opacity: 0 }}>{content}</Typography>
        ) : (
          <Typography variant="h5" sx={{ color: 'text.disabled', fontWeight: 500 }}>
            Nothing published yet
          </Typography>
        )}
      </Box>

      {/* Hidden measuring node — same styles as the visible text, used purely
          to probe rendered dimensions at candidate font sizes. Never shown. */}
      <Typography
        ref={measureRef}
        aria-hidden
        sx={{
          position: 'absolute',
          visibility: 'hidden',
          pointerEvents: 'none',
          top: -9999,
          left: -9999,
          fontFamily: style.fontFamily || 'inherit',
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: LINE_HEIGHT,
          letterSpacing: '0em',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxWidth: 'none',
        }}
      >
        {content || ''}
      </Typography>
    </Box>
  )
}

export default FreeText