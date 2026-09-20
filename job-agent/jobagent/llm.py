"""Thin abstraction over OpenAI / Anthropic chat completion so the rest of the
codebase doesn't care which provider is configured."""
from . import config


class LLMError(RuntimeError):
    pass


def chat(prompt: str, system: str = "", max_tokens: int = 2000) -> str:
    provider = config.LLM_PROVIDER
    if provider == "openai":
        return _chat_openai(prompt, system, max_tokens)
    if provider == "anthropic":
        return _chat_anthropic(prompt, system, max_tokens)
    raise LLMError(f"Unknown LLM_PROVIDER '{provider}'. Use 'openai' or 'anthropic'.")


def _chat_openai(prompt: str, system: str, max_tokens: int) -> str:
    if not config.OPENAI_API_KEY:
        raise LLMError("OPENAI_API_KEY is not set (check your .env file).")
    from openai import OpenAI

    client = OpenAI(api_key=config.OPENAI_API_KEY)
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    resp = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=messages,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content or ""


def _chat_anthropic(prompt: str, system: str, max_tokens: int) -> str:
    if not config.ANTHROPIC_API_KEY:
        raise LLMError("ANTHROPIC_API_KEY is not set (check your .env file).")
    import anthropic

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    resp = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system or anthropic.NOT_GIVEN,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in resp.content if block.type == "text")
