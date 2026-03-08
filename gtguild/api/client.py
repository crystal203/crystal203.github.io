import requests
from typing import Optional, List, Dict, Any
from .signer import get_sign, APP_KEY

BASE_URL = "https://api.game.bilibili.com/game/player/tools/kan_gong" 
COOKIES = {
    "SESSDATA": "dd2efb22%2C1788447936%2Ca0fc9%2A31CjAHlKdJsVfpTvd54m7jAKFXm53iEAaZQ5lV0qSaW8lOj0Qz6Fb0yfnIbeXVOWBkE2ESVnJBcjJTeEZMNFpsOExmUE5SQ2ZLQlA0YWxrcjJ3akRwZW1lWUxRM3JqNFFXOEdic29sVTVIUEk4cXEyejRhR0YzeTgyd3lxb1dVMldqaEgzcE9HRlZnIIEC"
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
    
    def _request(self, action: str, params: dict = None, date: str = None) -> Dict[str, Any]:
        url = f"{BASE_URL}/{action}"
        
        sign_params = get_sign(extra_params=params, date=date)
        
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
    
    def get_fight_report_detail(self, date: str, user_id: int = None, page_num: int = 1, page_size: int = 15) -> Optional[Dict]:
        params = {
            'date': date,
            'page_num': page_num,
            'page_size': page_size
        }
        if user_id is not None:
            params['user_id'] = user_id
        result = self._request('fight_details', params=params, date=date)
        return result.get('data') if result.get('code') == 0 else None
    
    def fetch_all_battle_data(self, progress_callback=None, 
                               fetch_by_user: bool = True) -> Dict[str, Any]:
        guild_info = self.get_user_info()
        boss_info = self.get_fight_news()
        report_meta = self.get_fight_report_date()
        
        if not all([guild_info, boss_info, report_meta]):
            return {"error": "Failed to fetch basic info"}
        
        members = report_meta['members']
        dates = report_meta['dates']
        all_records = []
        
        if fetch_by_user and members:
            total_tasks = len(dates) * len(members)
            task_type = "按玩家获取"
        else:
            total_tasks = len(dates)
            task_type = "按日期获取"
        
        total_estimated = total_tasks * 5
        
        if progress_callback:
            progress_callback(0, total_estimated, f"开始{task_type}出刀详情...")
        
        completed = 0
        
        if fetch_by_user and members:
            for date in dates:
                for member in members:
                    user_id = member.get('user_id')
                    if user_id is None:
                        continue
                    
                    page_num = 1
                    while True:
                        detail = self.get_fight_report_detail(
                            date=date, 
                            user_id=user_id, 
                            page_num=page_num, 
                            page_size=15
                        )
                        
                        if not detail:
                            break
                        
                        for record in detail.get('user_data', []):
                            record['_battle_date'] = date
                            record['_user_id'] = user_id
                            all_records.append(record)
                        
                        completed += 1
                        if progress_callback:
                            progress_callback(
                                completed, 
                                total_estimated, 
                                f"获取 {date} - {member.get('user_name', 'Unknown')} 第{page_num}页"
                            )
                        
                        if not detail.get('has_next_page'):
                            break
                        page_num += 1
        else:
            for date in dates:
                page_num = 1
                while True:
                    detail = self.get_fight_report_detail(
                        date=date, 
                        user_id=None, 
                        page_num=page_num, 
                        page_size=15
                    )
                    
                    if not detail:
                        break
                    
                    for record in detail.get('user_data', []):
                        record['_battle_date'] = date
                        record['_user_id'] = record.get('user_id')
                        all_records.append(record)
                    
                    completed += 1
                    if progress_callback:
                        progress_callback(
                            completed, 
                            total_estimated, 
                            f"获取 {date} 第{page_num}页"
                        )
                    
                    if not detail.get('has_next_page'):
                        break
                    page_num += 1
        
        return {
            "guild_name": guild_info.get('guild_name', '未知公会'),
            "boss_info": boss_info,
            "members": members,
            "dates": dates,
            "records": all_records
        }