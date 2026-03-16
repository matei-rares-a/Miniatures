arr=[10, 7, 8, 9, 1, 5]
 
def partition(arr, low, high):
    i = low -1
    pi= arr[high]
    for j in range(low, high):
        if arr[j]<= pi:
            i=i+1
            exchange arr[i], arr[j]
    exchange arr[high], arr[i+1]
    return i+1


def sort(arr, low, high):
    if len< high:
        pi = partition(arr, low, high)
        partition(arr, low, pi-1)
        partition(arr, pi+1, high)



sort(arr, 0, len(arr)-1)