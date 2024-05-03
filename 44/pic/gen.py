from PIL import Image
import os

from PIL import Image
import os

def center_image_in_square(file_path, output_path, square_size=64):
    # 打开图片
    image = Image.open(file_path).convert('RGBA')
    # 创建一个透明背景的图片
    new_image = Image.new('RGBA', (square_size, square_size), (255, 255, 255, 0))
    # 计算居中位置
    x = (square_size - image.width) // 2
    y = (square_size - image.height) // 2
    # 将原图粘贴到透明背景图中心
    new_image.paste(image, (x, y), image)
    # 保存新图片
    new_image.save(output_path, format='PNG')

def process_images_in_directory(directory):
    for filename in os.listdir(directory):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
            file_path = os.path.join(directory, filename)
            output_path = os.path.join(directory, 'centered_' + filename)
            center_image_in_square(file_path, output_path)# 使用示例
            
directory = './item/shield'
process_images_in_directory(directory)
