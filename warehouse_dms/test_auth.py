from google.cloud import vision
try:
    client = vision.ImageAnnotatorClient()
    print("✅ Authenticated! Your Service Account is active.")
except Exception as e:
    print(f"❌ Auth Failed: {e}")
