param(
  [string]$BaseUrl = 'http://localhost:3001',
  [string]$Origin = 'http://localhost:5173',
  [string]$Model = 'ollama/llama3.2'
)

$ErrorActionPreference = 'Stop'

$headers = @{
  Origin = $Origin
  Referer = "$Origin/"
}

function Step([string]$name) {
  Write-Host "[phase4-smoke] $name"
}

function Invoke-ApiJson {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [int]$TimeoutSec = 30
  )

  $uri = "$BaseUrl$Path"

  try {
    $params = @{
      Method = $Method
      Uri = $uri
      TimeoutSec = $TimeoutSec
      UseBasicParsing = $true
      Headers = $headers
    }

    if ($null -ne $Body) {
      $params.ContentType = 'application/json'
      $params.Body = ($Body | ConvertTo-Json -Depth 50 -Compress)
    } elseif ($Method -in @('POST', 'PUT', 'PATCH')) {
      $params.ContentType = 'application/json'
      $params.Body = '{}'
    }

    $resp = Invoke-WebRequest @params
    $text = $resp.Content

    $json = $null
    if ($text) {
      try {
        $json = $text | ConvertFrom-Json -Depth 50
      } catch {
        $json = $null
      }
    }

    return [PSCustomObject]@{
      ok = $true
      status = [int]$resp.StatusCode
      json = $json
      text = $text
    }
  } catch {
    $status = 0
    $text = $_.Exception.Message
    $json = $null

    if ($_.Exception.Response) {
      try {
        $status = [int]$_.Exception.Response.StatusCode
      } catch {}

      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $text = $reader.ReadToEnd()
      } catch {}

      if ($text) {
        try {
          $json = $text | ConvertFrom-Json -Depth 50
        } catch {
          $json = $null
        }
      }
    }

    return [PSCustomObject]@{
      ok = $false
      status = $status
      json = $json
      text = $text
    }
  }
}

function Invoke-ChatSend {
  param(
    [string]$ProjectId,
    [string]$Message
  )

  $res = Invoke-ApiJson -Method 'POST' -Path '/api/chat/send' -Body @{
    projectId = $ProjectId
    message = $Message
    mode = 'ask'
    model = $Model
  } -TimeoutSec 60

  $firstLine = $null
  if ($res.text) {
    $firstLine = ($res.text -split "`r?`n" | Where-Object { $_ -like 'data:*' } | Select-Object -First 1)
  }

  $firstData = $null
  if ($firstLine) {
    $firstData = ($firstLine -replace '^data:\s*', '')
  }

  $event = $null
  if ($firstData) {
    try {
      $event = $firstData | ConvertFrom-Json -Depth 20
    } catch {
      $event = $null
    }
  }

  return [PSCustomObject]@{
    ok = $res.ok
    status = $res.status
    firstType = if ($event) { $event.type } else { $null }
    conversationId = if ($event) { $event.conversationId } else { $null }
    messageId = if ($event) { $event.messageId } else { $null }
    hasConversationId = [bool](if ($event) { $event.conversationId } else { $null })
    hasMessageId = [bool](if ($event) { $event.messageId } else { $null })
    firstEventRaw = $firstData
  }
}

$report = [ordered]@{
  runAt = (Get-Date).ToUniversalTime().ToString('o')
  baseUrl = $BaseUrl
  model = $Model
  projectId = $null
  checks = [ordered]@{}
  details = [ordered]@{}
}

Step 'health'
$health = Invoke-ApiJson -Method 'GET' -Path '/api/health'
$report.details.health = [ordered]@{ ok = $health.ok; status = $health.status }
$report.checks.health = $health.ok

Step 'reset orchestrators'
[void](Invoke-ApiJson -Method 'POST' -Path '/api/agent/stop' -Body @{})
[void](Invoke-ApiJson -Method 'POST' -Path '/api/fleet/stop' -Body @{})

Step 'create project'
$project = Invoke-ApiJson -Method 'POST' -Path '/api/memory/projects' -Body @{
  name = "Phase4 Smoke $([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
  rootPath = 'z:\personal_IDE-master\personal_IDE-master'
  description = 'Phase 4 CLI smoke validation'
}

$projectId = $null
if ($project.json -and $project.json.project) {
  $projectId = $project.json.project.id
}

$report.projectId = $projectId
$report.details.projectCreate = [ordered]@{
  ok = $project.ok
  status = $project.status
}
$report.checks.projectCreate = [bool]$projectId

if (-not $projectId) {
  $report.checks.chatSseIds = $false
  $report.checks.conversationCrud = $false
  $report.checks.legacyConversationRoutes = $false
  $report.checks.agentLifecycle = $false
  $report.checks.fleetLifecycle = $false
  $report.checks.ollamaRoutes = $false
  $report.checks.nanoPayloadRoutes = $false
  $report.checks.nanoTelemetryShape = $false
  $report.checks.allPassed = $false

  $report | ConvertTo-Json -Depth 20
  exit 1
}

Step 'chat primary + legacy'
$chatPrimary = Invoke-ChatSend -ProjectId $projectId -Message 'phase4 smoke primary message'
$chatLegacy = Invoke-ChatSend -ProjectId $projectId -Message 'phase4 smoke legacy message'

$report.details.chatPrimary = $chatPrimary
$report.details.chatLegacy = $chatLegacy

$report.checks.chatSseIds = (
  $chatPrimary.ok -and
  $chatPrimary.firstType -eq 'message_start' -and
  $chatPrimary.hasConversationId -and
  $chatPrimary.hasMessageId
)

Step 'conversation routes'
$queryList = Invoke-ApiJson -Method 'GET' -Path "/api/chat/conversations?projectId=$([Uri]::EscapeDataString($projectId))"
$pathList = Invoke-ApiJson -Method 'GET' -Path "/api/chat/conversations/$([Uri]::EscapeDataString($projectId))"

$modernConversationId = $chatPrimary.conversationId
$legacyConversationId = if ($chatLegacy.conversationId) { $chatLegacy.conversationId } else { $chatPrimary.conversationId }

$modernPut = [PSCustomObject]@{ ok = $false; status = 0; json = $null }
$modernDelete = [PSCustomObject]@{ ok = $false; status = 0; json = $null }
if ($modernConversationId) {
  $modernPut = Invoke-ApiJson -Method 'PUT' -Path "/api/chat/conversations/$([Uri]::EscapeDataString($modernConversationId))" -Body @{ title = 'Phase4 Smoke Rename' }
  $modernDelete = Invoke-ApiJson -Method 'DELETE' -Path "/api/chat/conversations/$([Uri]::EscapeDataString($modernConversationId))"
}

$legacyRename = [PSCustomObject]@{ ok = $false; status = 0; json = $null }
$legacyDelete = [PSCustomObject]@{ ok = $false; status = 0; json = $null }
if ($legacyConversationId) {
  $legacyRename = Invoke-ApiJson -Method 'GET' -Path "/api/chat/conversations/$([Uri]::EscapeDataString($legacyConversationId))/rename?title=$([Uri]::EscapeDataString('Legacy Phase4 Rename'))"
  $legacyDelete = Invoke-ApiJson -Method 'GET' -Path "/api/chat/conversations/$([Uri]::EscapeDataString($legacyConversationId))/delete"
}

$report.details.conversations = [ordered]@{
  queryList = [ordered]@{ ok = $queryList.ok; status = $queryList.status }
  pathList = [ordered]@{ ok = $pathList.ok; status = $pathList.status }
  modernPut = [ordered]@{ ok = $modernPut.ok; status = $modernPut.status; success = if ($modernPut.json) { $modernPut.json.success } else { $null } }
  modernDelete = [ordered]@{ ok = $modernDelete.ok; status = $modernDelete.status; success = if ($modernDelete.json) { $modernDelete.json.success } else { $null } }
  legacyRename = [ordered]@{ ok = $legacyRename.ok; status = $legacyRename.status; success = if ($legacyRename.json) { $legacyRename.json.success } else { $null } }
  legacyDelete = [ordered]@{ ok = $legacyDelete.ok; status = $legacyDelete.status; success = if ($legacyDelete.json) { $legacyDelete.json.success } else { $null } }
}

$report.checks.conversationCrud = (
  $queryList.ok -and
  $pathList.ok -and
  $modernPut.ok -and
  $modernPut.json -and
  $modernPut.json.success -eq $true -and
  $modernDelete.ok -and
  $modernDelete.json -and
  $modernDelete.json.success -eq $true
)

$report.checks.legacyConversationRoutes = (
  $legacyRename.ok -and
  $legacyRename.json -and
  $legacyRename.json.success -eq $true -and
  $legacyDelete.ok -and
  $legacyDelete.json -and
  $legacyDelete.json.success -eq $true
)

Step 'agent lifecycle'
[void](Invoke-ApiJson -Method 'POST' -Path '/api/agent/stop' -Body @{})

$agentStart = Invoke-ApiJson -Method 'POST' -Path '/api/agent/start' -Body @{
  projectId = $projectId
  task = 'phase4 agent smoke'
  model = $Model
  maxIterations = 1
  stepDelayMs = 0
}
$agentStatus = Invoke-ApiJson -Method 'GET' -Path '/api/agent/status'
$agentPause = Invoke-ApiJson -Method 'POST' -Path '/api/agent/pause' -Body @{}
$agentResume = Invoke-ApiJson -Method 'POST' -Path '/api/agent/resume' -Body @{}
$agentStop = Invoke-ApiJson -Method 'POST' -Path '/api/agent/stop' -Body @{}

$report.details.agent = [ordered]@{
  start = [ordered]@{ ok = $agentStart.ok; status = $agentStart.status; success = if ($agentStart.json) { $agentStart.json.success } else { $null } }
  status = [ordered]@{ ok = $agentStatus.ok; status = $agentStatus.status; active = if ($agentStatus.json) { $agentStatus.json.active } else { $null }; state = if ($agentStatus.json) { $agentStatus.json.state } else { $null } }
  pause = [ordered]@{ ok = $agentPause.ok; status = $agentPause.status; success = if ($agentPause.json) { $agentPause.json.success } else { $null } }
  resume = [ordered]@{ ok = $agentResume.ok; status = $agentResume.status; success = if ($agentResume.json) { $agentResume.json.success } else { $null } }
  stop = [ordered]@{ ok = $agentStop.ok; status = $agentStop.status; success = if ($agentStop.json) { $agentStop.json.success } else { $null } }
}

$report.checks.agentLifecycle = (
  $agentStart.ok -and
  $agentStart.json -and
  $agentStart.json.success -eq $true -and
  $agentStatus.ok -and
  $agentPause.ok -and
  $agentPause.json -and
  $agentPause.json.success -eq $true -and
  $agentResume.ok -and
  $agentResume.json -and
  $agentResume.json.success -eq $true -and
  $agentStop.ok -and
  $agentStop.json -and
  $agentStop.json.success -eq $true
)

Step 'fleet lifecycle'
[void](Invoke-ApiJson -Method 'POST' -Path '/api/fleet/stop' -Body @{})

$fleetStart = Invoke-ApiJson -Method 'POST' -Path '/api/fleet/start' -Body @{
  projectId = $projectId
  task = 'phase4 fleet smoke'
  model = $Model
  agentCount = 2
  maxIterationsPerAgent = 1
  continuousMode = $false
}
$fleetStatus = Invoke-ApiJson -Method 'GET' -Path '/api/fleet/status'
$fleetPause = Invoke-ApiJson -Method 'POST' -Path '/api/fleet/pause' -Body @{}
$fleetResume = Invoke-ApiJson -Method 'POST' -Path '/api/fleet/resume' -Body @{}
$fleetStop = Invoke-ApiJson -Method 'POST' -Path '/api/fleet/stop' -Body @{}

$report.details.fleet = [ordered]@{
  start = [ordered]@{ ok = $fleetStart.ok; status = $fleetStart.status; success = if ($fleetStart.json) { $fleetStart.json.success } else { $null } }
  status = [ordered]@{ ok = $fleetStatus.ok; status = $fleetStatus.status; active = if ($fleetStatus.json) { $fleetStatus.json.active } else { $null }; state = if ($fleetStatus.json) { $fleetStatus.json.state } else { $null } }
  pause = [ordered]@{ ok = $fleetPause.ok; status = $fleetPause.status; success = if ($fleetPause.json) { $fleetPause.json.success } else { $null } }
  resume = [ordered]@{ ok = $fleetResume.ok; status = $fleetResume.status; success = if ($fleetResume.json) { $fleetResume.json.success } else { $null } }
  stop = [ordered]@{ ok = $fleetStop.ok; status = $fleetStop.status; success = if ($fleetStop.json) { $fleetStop.json.success } else { $null } }
}

$report.checks.fleetLifecycle = (
  $fleetStart.ok -and
  $fleetStart.json -and
  $fleetStart.json.success -eq $true -and
  $fleetStatus.ok -and
  $fleetPause.ok -and
  $fleetPause.json -and
  $fleetPause.json.success -eq $true -and
  $fleetResume.ok -and
  $fleetResume.json -and
  $fleetResume.json.success -eq $true -and
  $fleetStop.ok -and
  $fleetStop.json -and
  $fleetStop.json.success -eq $true
)

Step 'ollama routes'
$ollamaDiagnose = Invoke-ApiJson -Method 'GET' -Path '/api/ollama/diagnose'
$allModels = Invoke-ApiJson -Method 'GET' -Path '/api/providers/all-models'
$hasAnyOllamaModel = ($allModels.text -like '*ollama/*') -or ($allModels.text -like '*"ollama"*')

$report.details.ollama = [ordered]@{
  diagnose = [ordered]@{ ok = $ollamaDiagnose.ok; status = $ollamaDiagnose.status }
  allModels = [ordered]@{ ok = $allModels.ok; status = $allModels.status; hasAnyOllamaModel = $hasAnyOllamaModel }
}

$report.checks.ollamaRoutes = ($ollamaDiagnose.status -ne 404 -and $allModels.status -ne 404)

Step 'nano routes'
$nanoStatus = Invoke-ApiJson -Method 'GET' -Path '/api/nano/status'
$nanoDonation = Invoke-ApiJson -Method 'PUT' -Path '/api/nano/pool/donation' -Body @{ percent = 25 }
$nanoIdle = Invoke-ApiJson -Method 'PUT' -Path '/api/nano/pool/idle-training' -Body @{ enabled = $true }
$nanoOptIn = Invoke-ApiJson -Method 'POST' -Path '/api/nano/discovery/opt-in' -Body @{ enabled = $true; sharing_level = 'metadata' }
$nanoTrainingStatus = Invoke-ApiJson -Method 'GET' -Path '/api/nano/training/status'

$trainingHasCycle = $false
$trainingHasNanos = $false
$trainingHasEntropy = $false
if ($nanoTrainingStatus.json) {
  $propNames = $nanoTrainingStatus.json.PSObject.Properties.Name
  $trainingHasCycle = $propNames -contains 'cycle_phase'
  $trainingHasNanos = $propNames -contains 'total_nanos'
  $trainingHasEntropy = $propNames -contains 'last_router_entropy'
}

$report.details.nano = [ordered]@{
  status = [ordered]@{ ok = $nanoStatus.ok; status = $nanoStatus.status }
  donationRoute = [ordered]@{ ok = $nanoDonation.ok; status = $nanoDonation.status; error = if ($nanoDonation.json) { $nanoDonation.json.error } else { $null } }
  idleTrainingRoute = [ordered]@{ ok = $nanoIdle.ok; status = $nanoIdle.status; error = if ($nanoIdle.json) { $nanoIdle.json.error } else { $null } }
  optInRoute = [ordered]@{ ok = $nanoOptIn.ok; status = $nanoOptIn.status; error = if ($nanoOptIn.json) { $nanoOptIn.json.error } else { $null } }
  trainingStatus = [ordered]@{ ok = $nanoTrainingStatus.ok; status = $nanoTrainingStatus.status; hasCyclePhase = $trainingHasCycle; hasTotalNanos = $trainingHasNanos; hasLastRouterEntropy = $trainingHasEntropy }
}

$report.checks.nanoPayloadRoutes = (
  $nanoDonation.status -ne 404 -and $nanoDonation.status -ne 415 -and
  $nanoIdle.status -ne 404 -and $nanoIdle.status -ne 415 -and
  $nanoOptIn.status -ne 404 -and $nanoOptIn.status -ne 415
)

$report.checks.nanoTelemetryShape = ($trainingHasCycle -and $trainingHasNanos -and $trainingHasEntropy)

$critical = @(
  $report.checks.health,
  $report.checks.projectCreate,
  $report.checks.chatSseIds,
  $report.checks.conversationCrud,
  $report.checks.legacyConversationRoutes,
  $report.checks.agentLifecycle,
  $report.checks.fleetLifecycle,
  $report.checks.ollamaRoutes,
  $report.checks.nanoPayloadRoutes
)
$report.checks.allPassed = ($critical -notcontains $false)

Step 'complete'
$report | ConvertTo-Json -Depth 20

if (-not $report.checks.allPassed) {
  exit 1
}
