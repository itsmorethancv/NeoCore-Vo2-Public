const { app, screen } = require('electron')

app.whenReady().then(() => {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  
  let minX = displays[0].bounds.x
  let minY = displays[0].bounds.y
  let maxR = minX + displays[0].bounds.width
  let maxB = minY + displays[0].bounds.height
  
  displays.forEach(d => {
    if (d.bounds.x < minX) minX = d.bounds.x
    if (d.bounds.y < minY) minY = d.bounds.y
    if (d.bounds.x + d.bounds.width > maxR) maxR = d.bounds.x + d.bounds.width
    if (d.bounds.y + d.bounds.height > maxB) maxB = d.bounds.y + d.bounds.height
  })

  const width = maxR - minX
  const height = maxB - minY

  console.log('--- DIAGNOSTIC RESULTS ---')
  console.log('Primary:', primary.bounds)
  displays.forEach((d, i) => console.log(`Display ${i}:`, d.bounds))
  console.log(`Calculated Spanning Window | x: ${minX}, y: ${minY}, width: ${width}, height: ${height}`)
  console.log('--------------------------')
  
  app.quit()
}).catch(console.error)
