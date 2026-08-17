# One-off: copy the user's interior reference set out of the Cursor asset cache
# into public/survey-photos/int with element-tagged names.
$src = "C:\Users\IVA\.cursor\projects\c-Users-IVA-Downloads-space-energy-V7-space-energy-V3\assets"
$dst = "C:\Users\IVA\Downloads\space-energy-V7\space-energy-V3\public\survey-photos\int"
New-Item -ItemType Directory -Force -Path $dst | Out-Null

$map = [ordered]@{
  "bd3c0a2e" = "int-fire-1.png"
  "f422587f" = "int-fire-2.png"
  "41a86f62" = "int-fire-3.png"
  "e544ddbc" = "int-fire-4.png"
  "f3c2a5e3" = "int-fire-5.png"
  "7acff02a" = "int-fire-6.png"
  "bc25fdfd" = "int-fire-7.png"
  "7f0d2754" = "int-fire-8.png"

  "dcf9d29f" = "int-water-1.png"
  "fc2ad8ee" = "int-water-2.png"
  "03131c29" = "int-water-3.png"
  "ba7075e7" = "int-water-4.png"
  "fbf32421" = "int-water-5.png"
  "e5e8de56" = "int-water-6.png"
  "750ee10f" = "int-water-7.png"
  "6ff8af97" = "int-water-8.png"

  "9afd5cac" = "int-earth-1.png"
  "0806f6de" = "int-earth-2.png"
  "aea3d1fc" = "int-earth-3.png"
  "70aa4e39" = "int-earth-4.png"
  "98888464" = "int-earth-5.png"
  "4cdb33f6" = "int-earth-6.png"
  "cc1979c2" = "int-earth-7.png"

  "ca2ae0dd" = "int-air-1.png"
  "733a0bb3" = "int-air-2.png"
  "c0f75691" = "int-air-3.png"
  "263e64e7" = "int-air-4.png"
  "f2a37bd1" = "int-air-5.png"
  "a6715497" = "int-air-6.png"
  "98f03dce" = "int-air-7.png"
  "054ca83f" = "int-air-8.png"
  "b746abfe" = "int-air-9.png"
  "c03ffe1b" = "int-air-10.png"
  "f30f639f" = "int-air-11.png"
  "63bb1067" = "int-air-12.png"
  "352ba207" = "int-air-13.png"
  "fc46da15" = "int-air-14.png"
  "233be100" = "int-air-15.png"
  "efde9f1d" = "int-air-16.png"
}

foreach ($key in $map.Keys) {
  $hit = Get-ChildItem $src -Filter "*$key*" -File | Select-Object -First 1
  if ($hit) {
    Copy-Item $hit.FullName (Join-Path $dst $map[$key]) -Force
    Write-Output "OK   $($map[$key])"
  } else {
    Write-Output "MISS $key -> $($map[$key])"
  }
}
