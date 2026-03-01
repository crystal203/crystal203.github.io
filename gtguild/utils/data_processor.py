import pandas as pd
from datetime import datetime
from typing import List, Dict, Any


class BattleDataProcessor:

    def __init__(self, raw_data: Dict[str, Any]):
        self.guild_name = raw_data.get('guild_name', '未知公会')
        self.boss_info = {b['boss_name']: b for b in raw_data.get('boss_info', [])}
        self.members = {m['user_id']: m['user_name'] for m in raw_data.get('members', [])}
        self.dates = raw_data.get('dates', [])
        self.records = raw_data.get('records', [])
        self.df = self._to_dataframe()

    def _prepare_sorted_records(self) -> pd.DataFrame:
        if self.df.empty:
            return pd.DataFrame()
        return self.df.sort_values('log_time', ascending=False).reset_index(drop=True)

    def _to_dataframe(self) -> pd.DataFrame:
        rows = []
        for rec in self.records:
            base = {
                'user_id': rec['user_id'],
                'user_name': rec['user_name'],
                'battle_date': rec.get('_battle_date'),
                'server_time': rec['server_time'],
                'log_time': rec['log_time'],
                'damage': rec['damage'],
                'boss_name': rec['boss_info']['boss_name'],
                'elemental_type': rec['boss_info']['elemental_type_cn']
            }
            for idx, role in enumerate(rec.get('role_list', [])):
                base[f'role_{idx+1}_icon'] = role['icon']
                base[f'role_{idx+1}_dps'] = role['dps']
                base[f'role_{idx+1}_toughness'] = role['toughness']
                base[f'role_{idx+1}_recovery'] = role['recovery']
            rows.append(base)
        return pd.DataFrame(rows)
    
    def get_guild_daily_damage(self) -> pd.DataFrame:
        if self.df.empty:
            return pd.DataFrame(columns=['date', 'total_damage'])
        return self.df.groupby('battle_date')['damage'].sum().reset_index().rename(
            columns={'damage': 'total_damage'}).sort_values('battle_date')
    
    def get_guild_boss_damage(self) -> pd.DataFrame:
        if self.df.empty:
            return pd.DataFrame(columns=['boss_name', 'total_damage'])
        return self.df.groupby('boss_name')['damage'].sum().reset_index().rename(
            columns={'damage': 'total_damage'}).sort_values('total_damage', ascending=False)
    
    def get_player_total_damage(self) -> pd.DataFrame:
        if self.df.empty:
            return pd.DataFrame()
        
        player_boss = self.df.groupby(['user_name', 'boss_name'])['damage'].sum().reset_index()
        pivot = player_boss.pivot(index='user_name', columns='boss_name', values='damage').fillna(0)
        pivot['total'] = pivot.sum(axis=1)
        return pivot.sort_values('total', ascending=True)
    
    def get_player_stats(self, user_name: str) -> Dict[str, Any]:
        player_df = self.df[self.df['user_name'] == user_name]
        if player_df.empty:
            return None
        
        stats = {
            'total_damage': player_df['damage'].sum(),
            'daily_damage': player_df.groupby('battle_date')['damage'].sum().to_dict(),
            'boss_damage': player_df.groupby('boss_name')['damage'].sum().to_dict(),
            'attack_count': len(player_df),
            'attack_records': []
        }
        
        for date, group in player_df.sort_values('log_time', ascending=False).groupby('battle_date'):
            records = []
            for _, row in group.iterrows():
                roles = []
                for i in range(1, 5):
                    if pd.notna(row.get(f'role_{i}_dps')):
                        roles.append({
                            'icon': row[f'role_{i}_icon'],
                            'dps': row[f'role_{i}_dps'],
                            'toughness': row[f'role_{i}_toughness'],
                            'recovery': row[f'role_{i}_recovery']
                        })
                records.append({
                    'time': datetime.fromtimestamp(row['log_time']).strftime('%H:%M:%S'),
                    'boss': row['boss_name'],
                    'damage': row['damage'],
                    'roles': roles
                })
            stats['attack_records'].append({'date': date, 'records': records})
        
        return stats

    def get_player_attack_details(self, user_name: str) -> List[Dict]:

        player_df = self.df[self.df['user_name'] == user_name].copy()
        if player_df.empty:
            return []
            
        player_df = player_df.sort_values('log_time', ascending=False)
        results = []
        
        for _, row in player_df.iterrows():
            roles = []
            for i in range(1, 5):
                icon = row.get(f'role_{i}_icon')
                if pd.notna(icon): 
                    roles.append({
                        'slot': i,
                        'icon': icon,
                        'dps': float(row[f'role_{i}_dps']) if pd.notna(row[f'role_{i}_dps']) else 0,
                        'toughness': float(row[f'role_{i}_toughness']) if pd.notna(row[f'role_{i}_toughness']) else 0,
                        'recovery': float(row[f'role_{i}_recovery']) if pd.notna(row[f'role_{i}_recovery']) else 0
                    })
            
            results.append({
                'battle_date': row['battle_date'],
                'server_time': row['server_time'],
                'time_str': datetime.fromtimestamp(row['log_time']).strftime('%H:%M:%S'),
                'boss': row['boss_name'],
                'element': row['elemental_type'],
                'damage': int(row['damage']),
                'roles': roles 
            })
        
        return results

    def get_attendance_table(self) -> tuple[pd.DataFrame, int]:
        if self.df.empty:
            return pd.DataFrame(), 0
        
        attendance = self.df.groupby(['user_name', 'battle_date']).size().reset_index(name='attack_count')
        
        pivot = attendance.pivot(
            index='user_name', 
            columns='battle_date', 
            values='attack_count'
        ).fillna(0).astype(int)
        
        pivot = pivot.reindex(columns=sorted(pivot.columns))
        
        total_days = len(pivot.columns)
        
        pivot['📊 总计'] = pivot.sum(axis=1)
        pivot = pivot.sort_values('📊 总计', ascending=False)
        
        return pivot, total_days

    def get_player_attacks_by_date(self, user_name: str) -> Dict[str, List[Dict]]:
        attacks = self.get_player_attack_details(user_name)
        grouped = {}
        for attack in attacks:
            date = attack['battle_date']
            if date not in grouped:
                grouped[date] = []
            grouped[date].append(attack)
        return grouped
    
    def get_all_records_paginated(self, page: int = 1, page_size: int = 20, 
                                   sorted_df: pd.DataFrame = None) -> Dict:
        if sorted_df is None or sorted_df.empty:
            sorted_df = self._prepare_sorted_records()
        
        if sorted_df.empty:
            return {'total': 0, 'records': [], 'total_pages': 0, 'page': 1}
        
        total = len(sorted_df)
        total_pages = (total + page_size - 1) // page_size
        page = min(max(page, 1), total_pages)
        
        start = (page - 1) * page_size
        end = min(start + page_size, total) 
        
        records = []
        for _, row in sorted_df.iloc[start:end].iterrows():
            roles = []
            for i in range(1, 5):
                icon = row.get(f'role_{i}_icon')
                if pd.notna(icon):
                    roles.append({
                        'slot': i,
                        'icon': icon,
                        'dps': row[f'role_{i}_dps'],
                        'toughness': row[f'role_{i}_toughness'],
                        'recovery': row[f'role_{i}_recovery']
                    })
            records.append({
                'user_name': row['user_name'],
                'battle_date': row['battle_date'],
                'time': datetime.fromtimestamp(row['log_time']).strftime('%Y-%m-%d %H:%M:%S'),
                'boss': row['boss_name'],
                'element': row['elemental_type'],
                'damage': int(row['damage']),
                'roles': roles
            })
        
        return {
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'records': records
        }    
    def get_boss_rankings(self, top_n: int = 10) -> Dict[str, pd.DataFrame]:
        if self.df.empty:
            return {}
        
        result = {}
        for boss in self.df['boss_name'].unique():
            boss_df = self.df[self.df['boss_name'] == boss]
            
            player_stats = boss_df.groupby('user_name').agg({
                'damage': ['sum', 'mean', 'count']
            }).round(0)
            player_stats.columns = ['total_damage', 'avg_damage', 'attack_count']
            player_stats = player_stats.sort_values('total_damage', ascending=False).reset_index()
            
            player_stats = player_stats.head(top_n)
            player_stats['rank'] = range(1, len(player_stats) + 1)
            
            result[boss] = player_stats
        
        return result
    
    def get_team_composition(self, row: pd.Series) -> tuple:
        icons = []
        for i in range(1, 5):
            icon = row.get(f'role_{i}_icon')
            if pd.notna(icon):
                icons.append(icon)
        
        if not icons:
            return (None, tuple())
        
        first_icon = icons[0]
        sorted_icons = tuple(sorted(icons))
        
        return (first_icon, sorted_icons)
    
    def get_guild_team_stats(self) -> pd.DataFrame:
        if self.df.empty:
            return pd.DataFrame()
        
        df_copy = self.df.copy()
        team_info = df_copy.apply(self.get_team_composition, axis=1)
        df_copy['team_first'] = [t[0] for t in team_info]
        df_copy['team_icons'] = [t[1] for t in team_info]
        df_copy['team_id'] = df_copy['team_first'].astype(str) + '_' + df_copy['team_icons'].astype(str)
        
        team_stats = df_copy.groupby('team_id').agg({
            'team_first': 'first',
            'team_icons': 'first',
            'damage': ['sum', 'mean', 'count'],
            'boss_name': lambda x: x.value_counts().to_dict()
        })
        team_stats.columns = ['first_icon', 'all_icons', 'total_damage', 'avg_damage', 'attack_count', 'boss_dist']
        team_stats = team_stats.sort_values('total_damage', ascending=False).reset_index()
        
        return team_stats
    
    def get_player_team_stats(self, user_name: str) -> pd.DataFrame:
        player_df = self.df[self.df['user_name'] == user_name].copy()
        if player_df.empty:
            return pd.DataFrame()
        
        team_info = player_df.apply(self.get_team_composition, axis=1)
        player_df['team_first'] = [t[0] for t in team_info]
        player_df['team_icons'] = [t[1] for t in team_info]
        player_df['team_id'] = player_df['team_first'].astype(str) + '_' + player_df['team_icons'].astype(str)
        
        team_stats = player_df.groupby('team_id').agg({
            'team_first': 'first',
            'team_icons': 'first',
            'damage': ['sum', 'mean', 'count'],
            'boss_name': lambda x: x.value_counts().to_dict()
        })
        team_stats.columns = ['first_icon', 'all_icons', 'total_damage', 'avg_damage', 'attack_count', 'boss_dist']
        team_stats = team_stats.sort_values('total_damage', ascending=False).reset_index()
        
        return team_stats
    
    def get_player_boss_stats(self, user_name: str) -> pd.DataFrame:
        player_df = self.df[self.df['user_name'] == user_name]
        if player_df.empty:
            return pd.DataFrame()
        
        boss_stats = player_df.groupby('boss_name').agg({
            'damage': ['sum', 'mean', 'count']
        }).round(0)
        boss_stats.columns = ['total_damage', 'avg_damage', 'attack_count']
        boss_stats = boss_stats.sort_values('total_damage', ascending=False).reset_index()
        
        return boss_stats

    def get_boss_rankings(self, top_n: int = 10) -> Dict[str, Dict[str, pd.DataFrame]]:
        if self.df.empty:
            return {}
        
        result = {}
        for boss in self.df['boss_name'].unique():
            boss_df = self.df[self.df['boss_name'] == boss]
            
            player_avg_stats = boss_df.groupby('user_name').agg({
                'damage': ['mean', 'sum', 'count']
            })
            player_avg_stats.columns = ['avg_damage', 'total_damage', 'attack_count']
            player_avg_stats = player_avg_stats.round(0)
            player_avg_stats = player_avg_stats.sort_values('avg_damage', ascending=False).reset_index()
            player_avg_stats = player_avg_stats.head(top_n)
            player_avg_stats['rank'] = range(1, len(player_avg_stats) + 1)
            
            single_attack_stats = boss_df[['user_name', 'damage', 'log_time', 'battle_date']].copy()
            single_attack_stats = single_attack_stats.sort_values('damage', ascending=False).head(top_n)
            single_attack_stats['rank'] = range(1, len(single_attack_stats) + 1)
            single_attack_stats['time_str'] = single_attack_stats['log_time'].apply(
                lambda x: datetime.fromtimestamp(x).strftime('%m-%d %H:%M')
            )
            
            result[boss] = {
                'avg_ranking': player_avg_stats,
                'single_attack_ranking': single_attack_stats
            }
        
        return result
    
    def get_team_single_attacks(self, team_id: str, top_n: int = -1) -> pd.DataFrame:
        if self.df.empty:
            return pd.DataFrame()
        
        df_copy = self.df.copy()
        team_info = df_copy.apply(self.get_team_composition, axis=1)
        df_copy['team_first'] = [t[0] for t in team_info]
        df_copy['team_icons'] = [t[1] for t in team_info]
        df_copy['team_id'] = df_copy['team_first'].astype(str) + '_' + df_copy['team_icons'].astype(str)
        
        team_df = df_copy[df_copy['team_id'] == team_id]
        
        if team_df.empty:
            return pd.DataFrame()
        
        top_attacks = team_df[['user_name', 'damage', 'battle_date', 'log_time', 'boss_name']].copy()
        
        if (top_n != -1):
            top_attacks = top_attacks.sort_values('damage', ascending=False).head(top_n)
        else:
            top_attacks = top_attacks.sort_values('damage', ascending=False)

        top_attacks['time_str'] = top_attacks['log_time'].apply(
            lambda x: datetime.fromtimestamp(x).strftime('%m-%d %H:%M')
        )
        top_attacks['rank'] = range(1, len(top_attacks) + 1)
        
        return top_attacks
    
    def get_guild_team_stats(self) -> pd.DataFrame:
        if self.df.empty:
            return pd.DataFrame()
        
        df_copy = self.df.copy()
        team_info = df_copy.apply(self.get_team_composition, axis=1)
        df_copy['team_first'] = [t[0] for t in team_info]
        df_copy['team_icons'] = [t[1] for t in team_info]
        df_copy['team_id'] = df_copy['team_first'].astype(str) + '_' + df_copy['team_icons'].astype(str)
        
        team_stats = df_copy.groupby('team_id').agg({
            'team_first': 'first',
            'team_icons': 'first',
            'damage': ['sum', 'mean', 'count', 'max'], 
            'boss_name': lambda x: x.value_counts().to_dict()
        })
        team_stats.columns = ['first_icon', 'all_icons', 'total_damage', 'avg_damage', 'attack_count', 'max_damage', 'boss_dist']
        team_stats = team_stats.sort_values('total_damage', ascending=False).reset_index()
        
        return team_stats
    
    def get_player_team_stats(self, user_name: str) -> pd.DataFrame:
        player_df = self.df[self.df['user_name'] == user_name].copy()
        if player_df.empty:
            return pd.DataFrame()
        
        team_info = player_df.apply(self.get_team_composition, axis=1)
        player_df['team_first'] = [t[0] for t in team_info]
        player_df['team_icons'] = [t[1] for t in team_info]
        player_df['team_id'] = player_df['team_first'].astype(str) + '_' + player_df['team_icons'].astype(str)
        
        team_stats = player_df.groupby('team_id').agg({
            'team_first': 'first',
            'team_icons': 'first',
            'damage': ['sum', 'mean', 'count', 'max'],  
            'boss_name': lambda x: x.value_counts().to_dict()
        })
        team_stats.columns = ['first_icon', 'all_icons', 'total_damage', 'avg_damage', 'attack_count', 'max_damage', 'boss_dist']
        team_stats = team_stats.sort_values('total_damage', ascending=False).reset_index()
        
        return team_stats