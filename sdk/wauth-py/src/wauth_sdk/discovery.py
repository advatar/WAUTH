
def well_known_wauth_config_url(issuer: str) -> str:
    normalized = issuer[:-1] if issuer.endswith("/") else issuer
    return f"{normalized}/.well-known/aaif-wauth-configuration"
