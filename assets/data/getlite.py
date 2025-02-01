import json

# 读取输入文件
with open('mime-db.json', 'r') as infile:
    data = json.load(infile)

# 过滤掉没有 'extensions' 属性的对象
filtered_data = {key: value for key, value in data.items() if 'extensions' in value}

# 写入输出文件
with open('mime_db-lite.json', 'w') as outfile:
    json.dump(filtered_data, outfile, indent=4)



