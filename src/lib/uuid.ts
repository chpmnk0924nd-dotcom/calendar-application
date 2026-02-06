export function uuidv4(): string {
  if (typeof crypto !== 'undefined') {
    // Modern browsers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCrypto = crypto as any
    if (typeof anyCrypto.randomUUID === 'function') {
      return anyCrypto.randomUUID()
    }

    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)

      // Per RFC 4122
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80

      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
      return (
        hex.slice(0, 4).join('') +
        '-' +
        hex.slice(4, 6).join('') +
        '-' +
        hex.slice(6, 8).join('') +
        '-' +
        hex.slice(8, 10).join('') +
        '-' +
        hex.slice(10, 16).join('')
      )
    }
  }

  // Last-resort fallback (not crypto-strong but keeps app functional)
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1)
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`
}
