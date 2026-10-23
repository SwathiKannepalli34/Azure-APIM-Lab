"""Shared setup: configuration, Entra ID auth, OpenAI client and OpenTelemetry tracing."""
import os

from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from dotenv import load_dotenv
from openai import AzureOpenAI

load_dotenv()

API_VERSION = "2025-04-01-preview"
SCOPE = "https://cognitiveservices.azure.com/.default"


def require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"Missing {name}. Run scripts/deploy.ps1 or copy .env.sample to .env.")
    return value


def credential() -> DefaultAzureCredential:
    return DefaultAzureCredential()


def get_client() -> AzureOpenAI:
    return AzureOpenAI(
        azure_endpoint=require("AZURE_OPENAI_ENDPOINT"),
        azure_ad_token_provider=get_bearer_token_provider(credential(), SCOPE),
        api_version=API_VERSION,
    )


def deployment() -> str:
    return require("AZURE_OPENAI_DEPLOYMENT")


def enable_tracing(service_name: str = "foundry-demo") -> None:
    """Send GenAI spans (prompts, completions, token usage, latency) to Application Insights."""
    from azure.monitor.opentelemetry import configure_azure_monitor
    from opentelemetry.instrumentation.openai_v2 import OpenAIInstrumentor

    # Capture message content only because this demo uses synthetic prompts. Turn off for real data.
    os.environ.setdefault("OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT", "true")
    os.environ.setdefault("OTEL_SERVICE_NAME", service_name)
    configure_azure_monitor(connection_string=require("APPLICATIONINSIGHTS_CONNECTION_STRING"))
    OpenAIInstrumentor().instrument()
