import { useState, useCallback } from 'react'

/**
 * useCloseFade – plays a fade-out animation before actually calling onClose.
 * The window sets `isClosing` class for the duration of the transition, then
 * calls the real onClose so React can unmount the node.
 */
export function useCloseFade(onClose: () => void, durationMs = 320) {
  const [isClosing, setIsClosing] = useState(false)

  const triggerClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      onClose()
    }, durationMs)
  }, [onClose, durationMs])

  return { isClosing, triggerClose }
}
