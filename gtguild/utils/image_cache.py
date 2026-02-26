import streamlit as st
import requests
from typing import Optional
import hashlib

@st.cache_data(ttl=3600, show_spinner=False)
def get_image_data(url: str) -> Optional[bytes]:
    if not url:
        return None
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.bilibili.com/"
        }
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        return resp.content
    except requests.RequestException as e:
        return None


def cached_image(url: str, width: int = 40, caption: str = None, use_container_width: bool = False):
    if not url:
        st.write("🖼️")
        return
    
    image_data = get_image_data(url)
    if image_data:
        if (use_container_width):
            st.image(image_data, width='stretch', caption=caption)
        else:
            st.image(image_data, width='content', caption=caption) 
    else:
        st.write("❌")


def get_image_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()