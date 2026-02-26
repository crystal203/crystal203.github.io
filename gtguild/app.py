import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from api.client import GTClient
from utils.data_processor import BattleDataProcessor
from utils.chart_builder import ChartBuilder
import time
from utils.image_cache import cached_image, get_image_data

st.set_page_config(
    page_title="公会战数据统计",
    page_icon="⚔️",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.markdown("""
<style>
    .metric-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 10px;
        padding: 15px;
        color: white;
        text-align: center;
    }
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
    }
    .stTabs [data-baseweb="tab"] {
        border-radius: 8px 8px 0 0;
    }
</style>
""", unsafe_allow_html=True)


@st.cache_resource
def get_client():
    """获取API客户端单例"""
    return GTClient()

@st.cache_data(ttl=300)
def fetch_battle_data_cached(_client):
    """缓存的数据获取函数（5分钟有效期）"""
    progress_bar = st.progress(0)
    status_text = st.empty()
    
    def update_progress(current, total, message):
        progress = min(current / max(total, 1), 1.0)
        progress_bar.progress(progress)
        status_text.text(f"🔄 {message}")
    
    data = _client.fetch_all_battle_data(progress_callback=update_progress)
    progress_bar.progress(1.0)
    status_text.text("✅ 数据加载完成！")
    time.sleep(0.5)
    progress_bar.empty()
    status_text.empty()
    
    return data

def render_guild_tab(processor: BattleDataProcessor):
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("📊 每日伤害趋势")
        daily_df = processor.get_guild_daily_damage()
        st.plotly_chart(
            ChartBuilder.line_chart_daily_damage(daily_df, "公会每日总伤害"),
            width='stretch'
        )
    
    with col2:
        st.subheader("🎯 Boss 伤害分布")
        boss_df = processor.get_guild_boss_damage()
        if not boss_df.empty:
            fig = px.bar(
                boss_df, x='total_damage', y='boss_name', 
                orientation='h', color='boss_name',
                color_discrete_sequence=ChartBuilder.BOSS_COLORS,
                title="各 Boss 累计伤害"
            )
            fig.update_layout(showlegend=False, template='plotly_white')
            st.plotly_chart(fig, width='stretch')
    
    st.subheader("🏆 玩家伤害排行榜")
    pivot = processor.get_player_total_damage()
    if not pivot.empty:
        chart_df = pivot.reset_index()
        chart_df = chart_df.sort_values('total', ascending=True)
        chart_df_for_chart = chart_df.drop(columns=['total']).set_index('user_name')
        
        st.plotly_chart(
            ChartBuilder.stacked_bar_player_damage(chart_df_for_chart),
            width='stretch',
            key="player_damage_chart"
        )
    
    st.subheader("📋 成员出勤统计")
    attendance_df, total_days = processor.get_attendance_table()
    
    if not attendance_df.empty:
        total_column_name = '📊 总计'
        
        def style_regular_column(val):
            if not isinstance(val, (int, float)):
                return ''
            if val == 0:
                return 'background-color: #f5f5f5; color: #999'
            elif val == 1:
                return 'background-color: #c8e6c9; color: #2e7d32; font-weight: 500'
            elif val == 2:
                return 'background-color: #81c784; color: #1b5e20; font-weight: 600'
            else:
                return 'background-color: #43a047; color: white; font-weight: bold'
        
        def style_total_column(val):
            if not isinstance(val, (int, float)):
                return ''
            if total_days > 0:
                max_possible = 3 * total_days
                fill_rate = val / max_possible if max_possible > 0 else 0
                if fill_rate == 0:
                    return 'background-color: #f5f5f5; color: #999'
                elif fill_rate < 0.5:
                    return 'background-color: #ffcdd2; color: #c62828; font-weight: 500'
                elif fill_rate < 0.8:
                    return 'background-color: #fff9c4; color: #f57f17; font-weight: 600'
                elif fill_rate < 1.0:
                    return 'background-color: #c8e6c9; color: #2e7d32; font-weight: 600'
                else:
                    return 'background-color: #2e7d32; color: white; font-weight: bold'
            return ''
        
        styled_df = attendance_df.style
        regular_columns = [col for col in attendance_df.columns if col != total_column_name]
        
        if regular_columns:
            styled_df = styled_df.map(style_regular_column, subset=regular_columns)
        
        if total_column_name in attendance_df.columns:
            styled_df = styled_df.map(style_total_column, subset=[total_column_name])
        
        with st.expander("🎨 颜色图例", expanded=False):
            cols = st.columns(6)
            cols[0].markdown("<div style='background:#f5f5f5;color:#999;padding:8px;border-radius:4px;text-align:center;font-size:11px'>○ 未出刀</div>", unsafe_allow_html=True)
            cols[1].markdown("<div style='background:#c8e6c9;color:#2e7d32;padding:8px;border-radius:4px;text-align:center;font-size:11px;font-weight:500'>● 1 刀</div>", unsafe_allow_html=True)
            cols[2].markdown("<div style='background:#81c784;color:#1b5e20;padding:8px;border-radius:4px;text-align:center;font-size:11px;font-weight:600'>● 2 刀</div>", unsafe_allow_html=True)
            cols[3].markdown("<div style='background:#43a047;color:white;padding:8px;border-radius:4px;text-align:center;font-size:11px;font-weight:bold'>● 3 刀</div>", unsafe_allow_html=True)
            cols[4].markdown("<div style='background:#2e7d32;color:white;padding:8px;border-radius:4px;text-align:center;font-size:11px;font-weight:bold'>★ 满勤</div>", unsafe_allow_html=True)
            cols[5].markdown("<div style='background:#ffcdd2;color:#c62828;padding:8px;border-radius:4px;text-align:center;font-size:11px;font-weight:500'>⚠ 低勤</div>", unsafe_allow_html=True)
        
        st.dataframe(
            styled_df.format("{:.0f}"),
            width='stretch',
            hide_index=False,
            height=min(600, len(attendance_df) * 35 + 50)
        )
        
        csv = attendance_df.to_csv(encoding='utf-8-sig')
        st.download_button(
            "📥 导出出勤表 CSV",
            csv,
            file_name=f"{processor.guild_name}_出勤表_{time.strftime('%Y%m%d')}.csv",
            mime="text/csv"
        )
    else:
        st.info("📭 暂无出勤数据")

    st.subheader("🎯 各 Boss 伤害排行榜")
    boss_rankings = processor.get_boss_rankings(top_n=10)
    
    if boss_rankings:
        boss_tabs = st.tabs(list(boss_rankings.keys()))
        
        for tab, boss_name in zip(boss_tabs, boss_rankings.keys()):
            with tab:
                rankings = boss_rankings[boss_name]
                avg_df = rankings['avg_ranking']
                single_df = rankings['single_attack_ranking']
                
                col1, col2, col3 = st.columns(3)
                if not avg_df.empty:
                    col1.metric("📈 最高均伤", f"{avg_df['avg_damage'].max():,.0f}")
                    col2.metric("💥 总伤", f"{avg_df['total_damage'].sum():,}")
                    col3.metric("⚔️ 刀数", f"{int(avg_df['attack_count'].sum())}")
                
                st.markdown("### 📈 玩家平均伤害 Top 10")
                if not avg_df.empty:
                    avg_display = avg_df[['rank', 'user_name', 'avg_damage', 'total_damage', 'attack_count']].copy()
                    avg_display.columns = ['🏅 排名', '👤 玩家', '📈 均伤', '💥 总伤', '⚔️ 刀数']
                    st.dataframe(
                        avg_display.style.format({
                            '📈 均伤': '{:,.0f}',
                            '💥 总伤': '{:,.0f}'
                        }),
                        width='stretch',
                        hide_index=True
                    )
                
                st.markdown("### ⚡ 单刀伤害 Top 10")
                if not single_df.empty:
                    single_display = single_df[['rank', 'user_name', 'damage', 'battle_date', 'time_str']].copy()
                    single_display.columns = ['🏅 排名', '👤 玩家', '💥 伤害', '📅 日期', '⏰ 时间']
                    st.dataframe(
                        single_display.style.format({
                            '💥 伤害': '{:,.0f}'
                        }),
                        width='stretch',
                        hide_index=True
                    )
    
    st.subheader("⚔️ 公会刀型统计")
    team_stats = processor.get_guild_team_stats()
    
    if not team_stats.empty:
        st.caption(f"共发现 {len(team_stats)} 种刀型配置")
        top_teams = team_stats.head(20)
        
        for idx, row in top_teams.iterrows():
            st.markdown(f"**🏆 #{idx+1} 刀型配置**")
            
            role_cols = st.columns(4)
            all_icons = row['all_icons']
            for role_idx, icon in enumerate(all_icons, 1):
                with role_cols[role_idx-1]:
                    if icon and icon != 'nan' and pd.notna(icon):
                        cached_image(icon, width=50)
                        st.caption(f"角色{role_idx}")
            
            col1, col2, col3, col4 = st.columns(4)
            col1.metric("💥 顶伤", f"{row['max_damage']:,.0f}")
            col2.metric("📈 均伤", f"{row['avg_damage']:,.0f}")
            col3.metric("📊 总伤", f"{row['total_damage']:,.0f}")
            col4.metric("⚔️ 刀数", f"{row['attack_count']}")
            
            with st.expander("📊 详情", expanded=False):
                st.divider()
                
                st.markdown("**⚡ 单刀伤害 Top 10**:")
                team_id = row['team_id']
                top_attacks = processor.get_team_single_attacks(team_id, top_n=10)
                
                if not top_attacks.empty:
                    attack_cols = st.columns(2)
                    for i, (_, attack) in enumerate(top_attacks.iterrows()):
                        with attack_cols[i % 2]:
                            st.markdown(f"""
                            <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; margin: 4px 0;">
                                <div style="font-size: 12px;">
                                    <span style="color: #666;">#{attack['rank']} 👤 {attack['user_name'][:8]}</span><br>
                                    <span style="color: #d32f2f; font-weight: bold; font-size: 14px;">💥 {attack['damage']:,.0f}</span><br>
                                    <span style="color: #888; font-size: 11px;">📅 {attack['battle_date']} {attack['time_str']}</span>
                                </div>
                            </div>
                            """, unsafe_allow_html=True)
                else:
                    st.caption("暂无单刀记录")
            
            st.divider()
    


def render_player_tab(processor: BattleDataProcessor):
    players = list(processor.members.values())
    selected_player = st.selectbox("👤 选择玩家", players, index=0)
    
    stats = processor.get_player_stats(selected_player)
    if not stats:
        st.warning("该玩家暂无出刀记录")
        return
    
    cols = st.columns(4)
    cols[0].metric("总伤", f"{stats['total_damage']:,.0f}")
    cols[1].metric("刀数", stats['attack_count'])
    cols[2].metric("日均", f"{stats['total_damage']/max(len(stats['daily_damage']),1):,.0f}")
    cols[3].metric("天数", len(stats['daily_damage']))
    
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.subheader("📈 伤害趋势")
        daily = pd.DataFrame([
            {'battle_date': k, 'total_damage': v} 
            for k, v in stats['daily_damage'].items()
        ])
        st.plotly_chart(
            ChartBuilder.line_chart_daily_damage(daily, f"{selected_player} 每日伤害"),
            width='stretch'
        )
    
    with col2:
        st.subheader("🎯 Boss 贡献")
        st.plotly_chart(
            ChartBuilder.player_damage_pie(stats['boss_damage']),
            width='stretch'
        )
    
    st.subheader("🎯 各 Boss 伤害统计")
    player_boss_stats = processor.get_player_boss_stats(selected_player)
    
    if not player_boss_stats.empty:
        boss_cols = st.columns(min(len(player_boss_stats), 4))
        for idx, (_, row) in enumerate(player_boss_stats.iterrows()):
            with boss_cols[idx % len(boss_cols)]:
                with st.container(border=True):
                    st.markdown(f"**{row['boss_name'][:8]}**")
                    st.metric("💥 总伤", f"{row['total_damage']:,.0f}")
                    st.caption(f"📈 均伤：{row['avg_damage']:,.0f}")
                    st.caption(f"⚔️ 刀数：{row['attack_count']}")
    
    st.subheader("⚔️ 个人刀型统计")
    player_team_stats = processor.get_player_team_stats(selected_player)
    
    if not player_team_stats.empty:
        st.caption(f"共使用 {len(player_team_stats)} 种刀型配置")
        
        for idx, row in player_team_stats.iterrows():
            st.markdown(f"**🏆 #{idx+1} 刀型配置**")
            
            role_cols = st.columns(4)
            all_icons = row['all_icons']
            for role_idx, icon in enumerate(all_icons, 1):
                with role_cols[role_idx-1]:
                    if icon and icon != 'nan' and pd.notna(icon):
                        cached_image(icon, width=50)
                        st.caption(f"角色{role_idx}")
            
            col1, col2, col3, col4 = st.columns(4)
            col1.metric("💥 顶伤", f"{row['max_damage']:,.0f}")
            col2.metric("📈 均伤", f"{row['avg_damage']:,.0f}")
            col3.metric("📊 总伤", f"{row['total_damage']:,.0f}")
            col4.metric("⚔️ 刀数", f"{row['attack_count']}")
            
            with st.expander("📊 查看详情", expanded=False):
                st.divider()
                
                st.markdown("**⚡ 单刀伤害 Top 10**:")
                team_id = row['team_id']
                top_attacks = processor.get_team_single_attacks(team_id, top_n=10)
                
                player_top_attacks = top_attacks[top_attacks['user_name'] == selected_player]
                
                if not player_top_attacks.empty:
                    attack_cols = st.columns(2)
                    for i, (_, attack) in enumerate(player_top_attacks.iterrows()):
                        with attack_cols[i % 2]:
                            st.markdown(f"""
                            <div style="background: #f8f9fa; padding: 8px; border-radius: 6px; margin: 4px 0;">
                                <div style="font-size: 12px;">
                                    <span style="color: #666;">#{attack['rank']}</span><br>
                                    <span style="color: #d32f2f; font-weight: bold; font-size: 14px;">💥 {attack['damage']:,.0f}</span><br>
                                    <span style="color: #888; font-size: 11px;">📅 {attack['battle_date']} {attack['time_str']}</span>
                                </div>
                            </div>
                            """, unsafe_allow_html=True)
                else:
                    st.caption("暂无单刀记录")
            
            st.divider()
    
    st.subheader("⚔️ 出刀记录")
    
    attacks_by_date = processor.get_player_attacks_by_date(selected_player)
    
    if attacks_by_date:
        available_dates = sorted(attacks_by_date.keys(), reverse=True)
        selected_date = st.selectbox(
            "📅 选择日期", 
            available_dates, 
            key="player_date_select",
            label_visibility="collapsed"
        )
        
        if selected_date and attacks_by_date.get(selected_date):
            day_attacks = attacks_by_date[selected_date]
            records_per_row = 3
            
            for i in range(0, len(day_attacks), records_per_row):
                row_attacks = day_attacks[i:i+records_per_row]
                
                while len(row_attacks) < records_per_row:
                    row_attacks.append(None)
                
                cols = st.columns(len(row_attacks))
                
                for idx, attack in enumerate(row_attacks):
                    with cols[idx]:
                        if attack is None:
                            st.markdown("<div style='height: 180px;'></div>", unsafe_allow_html=True)
                        else:
                            with st.container(border=True):
                                st.markdown(f"""
                                <div style="font-size: 11px;">
                                    <span style="color: #666;">⏰ {attack['time_str']}</span><br>
                                    <span style="color: #555;">🎯 {attack['boss'][:8]}</span>
                                </div>
                                """, unsafe_allow_html=True)
                                
                                st.markdown(f"""
                                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                            padding: 10px; border-radius: 8px; margin: 8px 0; text-align: center;">
                                    <div style="font-size: 16px; font-weight: bold; color: white;">💥 {attack['damage']:,}</div>
                                </div>
                                """, unsafe_allow_html=True)
                                
                                st.caption("**🎭 角色**:")
                                role_cols = st.columns(4)
                                for role_idx, role in enumerate(attack['roles'], 1):
                                    with role_cols[role_idx-1]:
                                        cached_image(role['icon'], width='stretch')
                                
                                with st.expander("📊 查看详细数据", expanded=False):
                                    for role_idx, role in enumerate(attack['roles'], 1):
                                        col_icon, col_stats = st.columns([1, 3])
                                        with col_icon:
                                            cached_image(role['icon'], width=35)
                                        with col_stats:
                                            st.markdown(f"**角色{role['slot']}**")
                                            st.caption(f"💢 DPS: `{role['dps']:,.0f}`")
                                            st.caption(f"🛡️ 韧性：`{role['toughness']:,.0f}`")
                                            st.caption(f"💚 回复：`{role['recovery']:,.0f}`")
    else:
        st.info("📭 该玩家暂无出刀记录")

def render_attack_tab(processor: BattleDataProcessor):
    st.subheader("🔍 全局出刀记录")
    
    if '_sorted_records_df' not in st.session_state:
        st.session_state._sorted_records_df = processor._prepare_sorted_records()
    
    page_size = 30
    if 'attack_page' not in st.session_state:
        st.session_state.attack_page = 1
    
    page_data = processor.get_all_records_paginated(
        st.session_state.attack_page, 
        page_size, 
        sorted_df=st.session_state._sorted_records_df
    )
    
    col_nav1, col_nav2, col_nav3 = st.columns([1, 3, 1])
    with col_nav1:
        if st.button("⬅️", disabled=(st.session_state.attack_page == 1), key="prev_attack"):
            st.session_state.attack_page -= 1
            st.rerun()
    with col_nav3:
        next_disabled = (st.session_state.attack_page >= page_data['total_pages'])
        if st.button("➡️", disabled=next_disabled, key="next_attack"):
            st.session_state.attack_page += 1
            st.rerun()
    with col_nav2:
        st.markdown(f"**页码**: {page_data['page']} / {page_data['total_pages']} &nbsp;|&nbsp; **总计**: {page_data['total']} 条")
    
    if page_data['records']:
        records_per_row = 3
        
        for i in range(0, len(page_data['records']), records_per_row):
            row_records = page_data['records'][i:i+records_per_row]
            
            while len(row_records) < records_per_row:
                row_records.append(None)
            
            cols = st.columns(records_per_row)
            
            for idx, rec in enumerate(row_records):
                with cols[idx]:
                    if rec is None:
                        st.markdown("<div style='height: 180px;'></div>", unsafe_allow_html=True)
                    else:
                        with st.container(border=True):
                            st.markdown(f"""
                            <div style="font-size: 11px;">
                                <b>👤 {rec['user_name'][:8]}</b><br>
                                <span style="color: #666;">📅 {rec['battle_date']}</span><br>
                                <span style="color: #888;">⏰ {rec['time'].split()[1]}</span>
                            </div>
                            """, unsafe_allow_html=True)
                            
                            st.markdown(f"""
                            <div style="background: #f0f2f6; padding: 8px; border-radius: 6px; margin: 8px 0;">
                                <div style="font-size: 11px; color: #555;">🎯 {rec['boss'][:6]}</div>
                                <div style="font-size: 14px; font-weight: bold; color: #d32f2f;">💥 {rec['damage']:,}</div>
                            </div>
                            """, unsafe_allow_html=True)
                            
                            st.caption("**🎭 角色**:")
                            role_cols = st.columns(4)
                            for role_idx, role in enumerate(rec['roles'], 1):
                                with role_cols[role_idx-1]:
                                    cached_image(role['icon'], width='stretch')
                            
                            with st.expander("📊 查看详细数据", expanded=False):
                                for role_idx, role in enumerate(rec['roles'], 1):
                                    col_icon, col_stats = st.columns([1, 3])
                                    with col_icon:
                                        cached_image(role['icon'], width=35)
                                    with col_stats:
                                        st.markdown(f"**角色{role['slot']}**")
                                        st.caption(f"💢 DPS: `{role['dps']:,.0f}`")
                                        st.caption(f"🛡️ 韧性：`{role['toughness']:,.0f}`")
                                        st.caption(f"💚 回复：`{role['recovery']:,.0f}`")
    else:
        st.info("📭 暂无出刀记录")

def main():
    st.title("⚔️ 公会战数据统计")
    st.caption(f"更新时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    with st.sidebar:
        st.header("⚙️ 控制面板")
        if st.button("🔄 刷新数据", type="primary"):
            st.cache_data.clear()
            st.rerun()
        st.info("💡 数据每5分钟自动缓存，点击刷新可获取最新会战数据")
    
    client = get_client()
    with st.spinner("🔄 正在获取公会战数据..."):
        raw_data = fetch_battle_data_cached(client)
    
    if "error" in raw_data:
        st.error(f"❌ 数据加载失败: {raw_data['error']}")
        return
    
    processor = BattleDataProcessor(raw_data)
    
    st.info(f"🏰 公会: **{processor.guild_name}** | 📅 会战周期: **{len(processor.dates)}天** | 👥 成员: **{len(processor.members)}人** | ⚔️ 总出刀: **{len(processor.records)}次**")
    
    tab1, tab2, tab3 = st.tabs(["🏢 公会数据", "👤 玩家数据", "⚔️ 出刀数据"])
    
    with tab1:
        render_guild_tab(processor)
    with tab2:
        render_player_tab(processor)
    with tab3:
        render_attack_tab(processor)
    
    st.markdown("---")
    st.caption("数据仅供参考，请以游戏内为准")


if __name__ == "__main__":
    main()