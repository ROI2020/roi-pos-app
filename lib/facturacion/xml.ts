import forge from 'node-forge'

// WSAA exige que el contenido del TRA quede EMBEBIDO en el CMS (no detached).
// La firma es PKCS#7 SignedData, SHA1, sin atributos autenticados.
export function firmarTRA(traXml: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(traXml, 'utf8')
  p7.addCertificate(cert)
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [],
  })
  p7.sign()

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

// Extrae los campos relevantes de la respuesta de FECAESolicitar.
// node-soap ya parseó el SOAP a un objeto JS — aquí solo navegamos la estructura.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsearRespuestaFE(soapResult: any): {
  resultado: string
  cae?: string
  caeVto?: string
  nroCbte?: number
  obs?: Array<{ code: number; msg: string }>
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feResp: any = soapResult?.FECAESolicitarResult ?? soapResult

  // El resultado general viene en la cabecera; el detalle por comprobante en FeDetResp
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const det: any =
    feResp?.FeDetResp?.FECAEDetResponse ??
    feResp?.FeDetResp?.FECAEDetResponse?.[0] ??
    {}

  const resultado: string = det?.Resultado ?? feResp?.FeCabResp?.Resultado ?? 'R'
  const cae: string | undefined = det?.CAE ?? undefined
  const caeVto: string | undefined = det?.CAEFchVto ?? undefined
  const nroCbte: number | undefined =
    det?.CbteDesde !== undefined ? Number(det.CbteDesde) : undefined

  // Observaciones (pueden ser un objeto único o un array)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obs: Array<{ code: number; msg: string }> | undefined
  const obsRaw = det?.Observaciones?.Obs
  if (obsRaw) {
    const arr = Array.isArray(obsRaw) ? obsRaw : [obsRaw]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    obs = arr.map((o: any) => ({ code: Number(o.Code), msg: String(o.Msg) }))
  }

  // Errores a nivel de cabecera también se mapean como observaciones
  const errRaw = feResp?.Errors?.Err
  if (errRaw && !obs) {
    const arr = Array.isArray(errRaw) ? errRaw : [errRaw]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    obs = arr.map((e: any) => ({ code: Number(e.Code), msg: String(e.Msg) }))
  }

  return { resultado, cae, caeVto, nroCbte, obs }
}
