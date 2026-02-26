import requests
from typing import Optional, List, Dict, Any
from .signer import get_sign, APP_KEY

BASE_URL = "https://api.game.bilibili.com/game/player/tools/kan_gong" 
COOKIES = {
    "SESSDATA": "19603376%2C1787500129%2C158cc%2A21CjD1aTg4Om-uWyQD_X0NckD1YJqTMXA0v5oOXOPEKrn--N9sgAyCyd6qqXrQgoEv-dESVnROdmo5SGdSTmhLdm5mTmJUeXc3b250M1lYXzZ4bDB0Q1g1VEZ4NEc5Z1FKU1BtTzcxU211Ml96STJ0U0JHZnZjVWNDcWtobHVXSkc3TFg3djkyb21nIIEC"
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.bilibili.com/"
}


class GTClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.cookies.update(COOKIES)
        self.session.headers.update(HEADERS)
    
    def _request(self, action: str, params: dict = None) -> Dict[str, Any]:
        url = f"{BASE_URL}/{action}"
        
        sign_params = get_sign(extra_params=params)
        
        try:
            resp = self.session.get(url, params=sign_params, timeout=30)
            resp.raise_for_status()
            result = resp.json()
            if result.get('code') != 0:
                print(f"API Error [{action}]: {result.get('message')}")
            return result
        except requests.RequestException as e:
            print(f"Request Error [{action}]: {e}")
            return {"code": -1, "message": str(e), "data": None}
    
    def get_user_info(self) -> Optional[Dict]:
        result = self._request('user_info')
        return result.get('data') if result.get('code') == 0 else None
    
    def get_fight_news(self) -> Optional[List[Dict]]:
        result = self._request('fight_news')
        return result.get('data', {}).get('boss_info', []) if result.get('code') == 0 else None
    
    def get_fight_report_date(self) -> Optional[Dict[str, List]]:
        result = self._request('fight_report_date')
        if result.get('code') == 0 and result.get('data'):
            return {
                'members': result['data'].get('members', []),
                'dates': result['data'].get('dates', [])
            }
        return None
    
    def get_fight_report_detail(self, date: str, page_num: int = 1, page_size: int = 15) -> Optional[Dict]:
        params = {
            'date': date,
            'page_num': page_num,
            'page_size': page_size
        }
        result = self._request('fight_details', params=params)
        return result.get('data') if result.get('code') == 0 else None
    
    def fetch_all_battle_data(self, progress_callback=None) -> Dict[str, Any]:
        guild_info = self.get_user_info()
        boss_info = self.get_fight_news()
        report_meta = self.get_fight_report_date()
        
        if not all([guild_info, boss_info, report_meta]):
            return {"error": "Failed to fetch basic info"}
        
        all_records = []
        dates = report_meta['dates']
        total_estimated = len(dates) * 10
        
        if progress_callback:
            progress_callback(0, total_estimated, "开始获取出刀详情...")
        
        completed = 0
        for date in dates:
            page_num = 1
            while True:
                detail = self.get_fight_report_detail(date, page_num, page_size=15)
                if not detail:
                    break
                
                for record in detail.get('user_data', []):
                    record['_battle_date'] = date
                    all_records.append(record)
                
                completed += 1
                if progress_callback:
                    progress_callback(completed, total_estimated, f"获取 {date} 第{page_num}页")
                
                if not detail.get('has_next_page'):
                    break
                page_num += 1
        
        return {
            "guild_name": guild_info.get('guild_name', '未知公会'),
            "boss_info": boss_info,
            "members": report_meta['members'],
            "dates": dates,
            "records": all_records
        }