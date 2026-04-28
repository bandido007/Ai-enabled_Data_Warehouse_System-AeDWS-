"""
AI service layer.

The pipeline talks to OCR, LLM, and embedding providers exclusively through
the abstract interfaces in services/interfaces/. Concrete implementations
live in services/providers/ (Google Cloud) and services/mocks/ (offline /
test). The single entry point for consumers is `get_service_registry()`.
"""
