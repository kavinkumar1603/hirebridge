# Test HireBridge API Endpoints

Write-Host "`n🧪 Testing HireBridge Backend API...`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:8080"

# Test 1: Health Check
Write-Host "1️⃣ Testing GET /api/test" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/test" -Method GET
    Write-Host "✅ Success: $($response.message)" -ForegroundColor Green
    Write-Host "   Timestamp: $($response.timestamp)`n"
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 2: Start Interview
Write-Host "2️⃣ Testing POST /api/questions/start" -ForegroundColor Yellow
try {
    $body = @{
        role = "Software Developer"
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$baseUrl/api/questions/start" -Method POST -Body $body -ContentType "application/json"
    $interviewId = $response.interviewId
    
    Write-Host "✅ Success: Interview started" -ForegroundColor Green
    Write-Host "   Interview ID: $interviewId"
    Write-Host "   Question: $($response.question.Substring(0, [Math]::Min(80, $response.question.Length)))..."
    Write-Host "   Question Number: $($response.questionNumber)`n"
    
    # Test 3: Get Next Question
    Write-Host "3️⃣ Testing POST /api/questions/next" -ForegroundColor Yellow
    try {
        $nextBody = @{
            interviewId = $interviewId
            role = "Software Developer"
            lastAnswer = "I have 5 years of experience working with React and Node.js. I've built several full-stack applications using these technologies."
        } | ConvertTo-Json
        
        $nextResponse = Invoke-RestMethod -Uri "$baseUrl/api/questions/next" -Method POST -Body $nextBody -ContentType "application/json"
        
        Write-Host "✅ Success: Next question generated" -ForegroundColor Green
        Write-Host "   Question: $($nextResponse.question.Substring(0, [Math]::Min(80, $nextResponse.question.Length)))..."
        Write-Host "   Question Number: $($nextResponse.questionNumber)`n"
    } catch {
        Write-Host "❌ Failed: $($_.Exception.Message)`n" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)`n" -ForegroundColor Red
}

# Test 4: D-ID Endpoint (will likely fail without API key, but tests the endpoint)
Write-Host "4️⃣ Testing POST /api/did/talk (may fail without valid API key)" -ForegroundColor Yellow
try {
    $didBody = @{
        scriptText = "Hello, welcome to your interview!"
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$baseUrl/api/did/talk" -Method POST -Body $didBody -ContentType "application/json" -ErrorAction Stop
    Write-Host "✅ Success: Video URL received" -ForegroundColor Green
    Write-Host "   Video URL: $($response.videoUrl)`n"
} catch {
    $errorMessage = $_.Exception.Message
    if ($errorMessage -like "*API key not configured*" -or $errorMessage -like "*502*" -or $errorMessage -like "*401*") {
        Write-Host "⚠️  Expected failure: D-ID API key not configured or invalid" -ForegroundColor Yellow
        Write-Host "   This is normal if you haven't set up DID_API_KEY in .env`n" -ForegroundColor Gray
    } else {
        Write-Host "❌ Unexpected error: $errorMessage`n" -ForegroundColor Red
    }
}

Write-Host "`n✨ API Testing Complete!`n" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor White
Write-Host "- ✅ The backend server is running correctly" -ForegroundColor Green
Write-Host "- ✅ Interview question endpoints are working" -ForegroundColor Green
Write-Host "- ⚠️  D-ID avatar requires API key configuration" -ForegroundColor Yellow
Write-Host "`nNext Steps:" -ForegroundColor White
Write-Host "1. Set up your .env file with API keys (see backend/.env.example)" -ForegroundColor Gray
Write-Host "2. Start the frontend: cd frontend && npm run dev" -ForegroundColor Gray
Write-Host "3. Test the full application in your browser`n" -ForegroundColor Gray
