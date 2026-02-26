import plotly.graph_objects as go
import plotly.express as px
from plotly.colors import qualitative
import pandas as pd


class ChartBuilder:
    """Plotly图表构建器"""
    
    # Boss颜色映射（自动分配或预设）
    BOSS_COLORS = qualitative.Plotly
    
    @staticmethod
    def line_chart_daily_damage(df: pd.DataFrame, title: str = "每日伤害趋势") -> go.Figure:
        """折线图：每日伤害"""
        if df.empty:
            return go.Figure().update_layout(title="暂无数据")
        
        fig = px.line(df, x='battle_date', y='total_damage', markers=True, title=title)
        fig.update_layout(
            xaxis_title="日期",
            yaxis_title="伤害值",
            hovermode='x unified',
            template='plotly_white'
        )
        return fig
    
    @staticmethod
    def stacked_bar_player_damage(pivot_df: pd.DataFrame, title: str = "玩家伤害排名") -> go.Figure:
        """堆叠横向条形图：玩家伤害（按Boss分解）"""
        if pivot_df.empty:
            return go.Figure().update_layout(title="暂无数据")
        
        # 准备数据
        bosses = [c for c in pivot_df.columns if c != 'total']
        fig = go.Figure()
        
        for i, boss in enumerate(bosses):
            fig.add_trace(go.Bar(
                name=boss,
                x=pivot_df[boss],
                y=pivot_df.index,
                orientation='h',
                marker_color=ChartBuilder.BOSS_COLORS[i % len(ChartBuilder.BOSS_COLORS)],
                hovertemplate=f'{boss}<br>伤害: %{{x:,.0f}}<extra></extra>'
            ))
        
        fig.update_layout(
            barmode='stack',
            title=title,
            xaxis_title="伤害值",
            yaxis_title="玩家",
            height=max(400, len(pivot_df) * 35),
            template='plotly_white',
            legend_title="Boss"
        )
        return fig
    
    @staticmethod
    def player_damage_pie(boss_damage: dict, title: str = "Boss伤害占比") -> go.Figure:
        """饼图：玩家对各Boss伤害分布"""
        if not boss_damage:
            return go.Figure().update_layout(title="暂无数据")
        
        fig = px.pie(
            values=list(boss_damage.values()),
            names=list(boss_damage.keys()),
            title=title,
            color_discrete_sequence=ChartBuilder.BOSS_COLORS,
            hole=0.4
        )
        fig.update_traces(textposition='inside', textinfo='percent+label')
        fig.update_layout(template='plotly_white')
        return fig
    
    @staticmethod
    def role_stats_table(teams: list) -> dict:
        """生成角色统计表格配置（Streamlit用）"""
        if not teams:
            return {"columns": [], "data": []}
        
        return {
            "columns": ["队伍", "平均DPS", "平均韧性", "平均回复"],
            "data": [
                [
                    "👥 " + " + ".join([f"![{i+1}]({icon})" for i, icon in enumerate(t['icons'])]),
                    f"{t['avg_dps']:,.0f}",
                    f"{t['avg_toughness']:,.0f}",
                    f"{t['avg_recovery']:,.0f}"
                ]
                for t in teams
            ]
        }