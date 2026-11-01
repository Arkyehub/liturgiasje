import { execFileSync, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'

const databaseContainer = 'liturgiasje-private-db'
const networkName = 'liturgiasje-auth-internal'
const host = '127.0.0.1'
const port = 15432
const allowedOrigin = 'http://127.0.0.1:3030'

const internal = execFileSync('docker', ['network', 'inspect', '--format', '{{.Internal}}', networkName], { encoding: 'utf8' }).trim()
if (internal !== 'true') throw new Error('Refusing to proxy a non-internal Docker network')

for (const name of [databaseContainer, 'liturgiasje-private-auth-replay', 'liturgiasje-private-rest-replay']) {
  const container = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0]
  if (!container.NetworkSettings.Networks[networkName]) throw new Error(`Refusing container outside ${networkName}`)
  const bindings = Object.values(container.HostConfig.PortBindings || {}).flat()
  if (bindings.some(binding => binding?.HostIp && binding.HostIp !== '127.0.0.1')) {
    throw new Error(`Refusing container with a non-loopback published port: ${name}`)
  }
}

const python = String.raw`
import base64, json, sys, urllib.request, urllib.error
request = json.loads(sys.stdin.read())
body = base64.b64decode(request['body']) if request['body'] else None
try:
    response = urllib.request.urlopen(urllib.request.Request(request['url'], data=body, headers=request['headers'], method=request['method']), timeout=25)
except urllib.error.HTTPError as error:
    response = error
except Exception:
    print(json.dumps({'status':502,'headers':[],'body':''})); sys.exit(0)
payload = response.read()
print(json.dumps({'status':response.status,'headers':list(response.headers.items()),'body':base64.b64encode(payload).decode()}))
`

const server = createServer((request, response) => {
  const origin = request.headers.origin
  if (origin && origin !== allowedOrigin) {
    response.writeHead(403).end()
    return
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': request.headers['access-control-request-headers'] || 'authorization, apikey, content-type, prefer',
      'Vary': 'Origin',
    }).end()
    return
  }

  let upstream
  if (request.url === '/auth/v1' || request.url.startsWith('/auth/v1/')) {
    upstream = `http://auth-replay:9999${request.url.slice('/auth/v1'.length)}`
  } else if (request.url === '/rest/v1' || request.url.startsWith('/rest/v1/')) {
    upstream = `http://rest-replay:3000${request.url.slice('/rest/v1'.length)}`
  } else {
    response.writeHead(404).end()
    return
  }

  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) => !['host', 'connection', 'content-length'].includes(key)))
    const input = JSON.stringify({
      url: upstream,
      method: request.method,
      headers,
      body: Buffer.concat(chunks).toString('base64'),
    })
    const result = spawnSync('docker', ['exec', '-i', databaseContainer, 'python3', '-c', python], {
      input,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30000,
    })
    if (result.error || result.status !== 0) {
      response.writeHead(502).end()
      return
    }
    try {
      const upstreamResponse = JSON.parse(result.stdout)
      const forwarded = Object.fromEntries(upstreamResponse.headers.filter(([key]) => !['connection', 'transfer-encoding', 'content-length', 'access-control-allow-origin', 'access-control-allow-credentials'].includes(key.toLowerCase())))
      if (origin) {
        forwarded['Access-Control-Allow-Origin'] = allowedOrigin
        forwarded['Access-Control-Allow-Credentials'] = 'true'
        forwarded.Vary = 'Origin'
      }
      const payload = Buffer.from(upstreamResponse.body, 'base64')
      forwarded['Content-Length'] = String(payload.length)
      response.writeHead(upstreamResponse.status, forwarded)
      response.end(payload)
    } catch {
      response.writeHead(502).end()
    }
  })
})

server.listen(port, host, () => process.stdout.write(`local Supabase test gateway listening on ${host}:${port}\n`))
