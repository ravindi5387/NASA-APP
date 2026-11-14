declare module 'aladin-lite' {
  const api: {
    init: Promise<void>
    aladin(selector: string, options: {
      survey: string
      fov: number
      cooFrame: string
      showCooGridControl: boolean
      showSimbadPointerControl?: boolean
      showCooGrid?: boolean
    }): {
      gotoRaDec(ra: number, dec: number): void
      getRaDec(): [number, number]
      remove?(): void
    }
  }
  export default api
}
